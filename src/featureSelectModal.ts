import { App, Modal, Setting } from 'obsidian';

interface FeatureSelectModalOptions {
	onOpenReportSearch: () => void;
	onOpenFinancialExtract: () => void;
	onInsertReportList: () => void;
}

export class FeatureSelectModal extends Modal {
	private readonly onOpenReportSearch: () => void;
	private readonly onOpenFinancialExtract: () => void;
	private readonly onInsertReportList: () => void;

	constructor(app: App, options: FeatureSelectModalOptions) {
		super(app);
		this.onOpenReportSearch = options.onOpenReportSearch;
		this.onOpenFinancialExtract = options.onOpenFinancialExtract;
		this.onInsertReportList = options.onInsertReportList;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('dart-plugin-modal');
		contentEl.createEl('h2', { text: 'Dart 기능 선택' });

		new Setting(contentEl)
			.setName('Dart 보고서 리스트')
			.setDesc('현재 노트의 기업에 대한 보고서 리스트 블럭을 삽입합니다.')
			.addButton((button) => {
				button
					.setButtonText('삽입')
					.setCta()
					.onClick(() => {
						this.close();
						this.onInsertReportList();
					});
			});

		new Setting(contentEl)
			.setName('보고서 검색')
			.setDesc('기업명과 기간으로 정기보고서를 검색합니다.')
			.addButton((button) => {
				button
					.setButtonText('열기')
					.setCta()
					.onClick(() => {
						this.close();
						this.onOpenReportSearch();
					});
			});

		new Setting(contentEl)
			.setName('재무제표 추출')
			.setDesc('공시 URL 또는 접수번호에서 재무제표 표를 추출합니다.')
			.addButton((button) => {
				button
					.setButtonText('열기')
					.onClick(() => {
						this.close();
						this.onOpenFinancialExtract();
					});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
