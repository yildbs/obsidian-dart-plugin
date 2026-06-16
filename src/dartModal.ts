import { App, Modal, Notice, Setting } from 'obsidian';
import { extractReceiptNo } from './dartUrl';
import { AmountUnit, DartExtractRequest, ExtractType } from './types';

interface DartModalOptions {
	apiKey: string;
	defaultUnit: AmountUnit;
	onSubmit: (request: DartExtractRequest) => Promise<void>;
}

const EXTRACT_TYPE_OPTIONS: {
	type: ExtractType;
	label: string;
	description: string;
}[] = [
	{
		type: 'consolidated_comprehensive_income',
		label: '연결포괄손익계산서',
		description: '연결 기준 매출과 영업이익을 추출합니다.',
	},
	{
		type: 'separate_comprehensive_income',
		label: '포괄손익계산서',
		description: '별도 기준 매출과 영업이익을 추출합니다.',
	},
];

export class DartExtractModal extends Modal {
	private apiKey: string;
	private dartUrl = '';
	private selectedTypes = new Set<ExtractType>([
		'consolidated_comprehensive_income',
	]);
	private unit: AmountUnit;
	private isRunning = false;
	private readonly onSubmit: (request: DartExtractRequest) => Promise<void>;

	constructor(app: App, options: DartModalOptions) {
		super(app);
		this.apiKey = options.apiKey;
		this.unit = options.defaultUnit;
		this.onSubmit = options.onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dart-plugin-modal');
		contentEl.createEl('h2', { text: 'Dart 데이터 추출' });

		new Setting(contentEl)
			.setName('API key')
			.setDesc('Dart open API key를 입력합니다.')
			.addText((text) => {
				text.inputEl.type = 'password';
				text
					.setPlaceholder('API key')
					.setValue(this.apiKey)
					.onChange((value) => {
						this.apiKey = value.trim();
					});
			});

		new Setting(contentEl)
			.setName('Dart URL 또는 접수번호')
			.setDesc('공시 URL 또는 14자리 rcpno를 입력합니다.')
			.addText((text) => {
				text
					.setPlaceholder('공시 URL 또는 접수번호')
					.setValue(this.dartUrl)
					.onChange((value) => {
						this.dartUrl = value.trim();
					});
			});

		const extractSetting = new Setting(contentEl)
			.setName('추출 항목')
			.setDesc('하나 이상의 항목을 선택합니다.');
		const checkboxContainer = extractSetting.controlEl.createDiv({
			cls: 'dart-plugin-checkboxes',
		});

		for (const option of EXTRACT_TYPE_OPTIONS) {
			const labelEl = checkboxContainer.createEl('label', {
				cls: 'dart-plugin-checkbox-row',
			});
			const checkbox = labelEl.createEl('input', { type: 'checkbox' });
			checkbox.checked = this.selectedTypes.has(option.type);
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.selectedTypes.add(option.type);
				} else {
					this.selectedTypes.delete(option.type);
				}
			});
			const textContainer = labelEl.createDiv();
			textContainer.createDiv({
				cls: 'dart-plugin-checkbox-label',
				text: option.label,
			});
			textContainer.createDiv({
				cls: 'dart-plugin-checkbox-desc',
				text: option.description,
			});
		}

		new Setting(contentEl)
			.setName('금액 단위')
			.setDesc('포괄손익계산서 금액 단위입니다.')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('억', '억원')
					.addOption('조', '조원')
					.setValue(this.unit)
					.onChange((value) => {
						this.unit = value as AmountUnit;
					});
			});

		new Setting(contentEl)
			.addButton((button) => {
				button
					.setButtonText('실행')
					.setCta()
					.onClick(async () => {
						await this.submit();
					});
			})
			.addButton((button) => {
				button.setButtonText('취소').onClick(() => {
					this.close();
				});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		if (this.isRunning) {
			return;
		}

		const receiptNo = extractReceiptNo(this.dartUrl);
		if (this.apiKey === '') {
			new Notice('Dart API key를 입력해야 합니다.');
			return;
		}
		if (this.dartUrl === '') {
			new Notice('Dart 공시 URL을 확인해야 합니다.');
			return;
		}
		if (receiptNo === null) {
			new Notice('URL에서 접수번호를 찾을 수 없습니다.');
			return;
		}
		if (this.selectedTypes.size === 0) {
			new Notice('추출할 항목을 하나 이상 선택해야 합니다.');
			return;
		}

		this.isRunning = true;
		try {
			await this.onSubmit({
				apiKey: this.apiKey,
				dartUrl: this.dartUrl,
				rcpNo: receiptNo,
				extractTypes: EXTRACT_TYPE_OPTIONS.map((option) => option.type).filter(
					(type) => this.selectedTypes.has(type),
				),
				unit: this.unit,
			});
			this.close();
		} finally {
			this.isRunning = false;
		}
	}
}
