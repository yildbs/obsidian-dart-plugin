import { App, PluginSettingTab, Setting } from 'obsidian';
import DartPlugin from './main';
import { AmountUnit } from './types';

export interface DartPluginSettings {
	apiKey: string;
	defaultUnit: AmountUnit;
}

export const DEFAULT_SETTINGS: DartPluginSettings = {
	apiKey: '',
	defaultUnit: '억',
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
