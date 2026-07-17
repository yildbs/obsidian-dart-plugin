import { App, PluginSettingTab, Setting } from 'obsidian';
import DartPlugin from './main';
import {
	AmountUnit,
	DartReportListBlockState,
	DartReportListPresetId,
	DartReportListViewState,
} from './types';

export interface DartPluginSettings {
	apiKey: string;
	defaultUnit: AmountUnit;
	reportSearchStartDate: string;
	reportSearchEndDate: string;
	reportSearchIncludeUrl: boolean;
	reportSearchIncludeFinancialStatement: boolean;
	reportListBlocks: Record<string, DartReportListBlockState>;
}

export const DEFAULT_REPORT_LIST_PRESETS: DartReportListPresetId[] = [
	'performance',
	'periodic',
	'material',
	'ownership',
	'issuance',
	'shareholderReturn',
	'governance',
	'marketAction',
	'audit',
	'other',
];

export const DEFAULT_REPORT_LIST_VIEW_STATE: DartReportListViewState = {
	searchText: '',
	enabledPresetIds: DEFAULT_REPORT_LIST_PRESETS,
	includeCorrections: true,
	sortKey: 'receiptDate',
	sortDirection: 'desc',
};

export const DEFAULT_SETTINGS: DartPluginSettings = {
	apiKey: '',
	defaultUnit: '억',
	reportSearchStartDate: getDateOffsetByYears(new Date(), -1),
	reportSearchEndDate: formatDateInput(new Date()),
	reportSearchIncludeUrl: true,
	reportSearchIncludeFinancialStatement: false,
	reportListBlocks: {},
};

export class DartSettingTab extends PluginSettingTab {
	plugin: DartPlugin;

	constructor(app: App, plugin: DartPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName('Dart 설정').setHeading();

		new Setting(containerEl)
			.setName('Dart API key')
			.setDesc('Opendart API 인증키를 로컬 플러그인 데이터에 저장합니다.')
			.addText((text) => {
				text.inputEl.type = 'password';
				text
					.setPlaceholder('API key')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('기본 금액 단위')
			.setDesc('포괄손익계산서 금액을 표시할 기본 단위입니다.')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('억', '억원')
					.addOption('조', '조원')
					.setValue(this.plugin.settings.defaultUnit)
					.onChange(async (value) => {
						this.plugin.settings.defaultUnit = value as AmountUnit;
						await this.plugin.saveSettings();
					});
			});
	}
}

function getDateOffsetByYears(date: Date, years: number): string {
	const nextDate = new Date(date);
	nextDate.setFullYear(nextDate.getFullYear() + years);
	return formatDateInput(nextDate);
}

function formatDateInput(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}
