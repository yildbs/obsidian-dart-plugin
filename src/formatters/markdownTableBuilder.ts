import { formatConvertedAmount } from './amountFormatter';
import { IncomeStatementTable } from '../types';

export function buildIncomeStatementMarkdown(
	table: IncomeStatementTable,
): string {
	const header = ['구분', ...table.columns];
	const alignment = ['----', ...table.columns.map(() => '-----:')];
	const rows = table.rows.map((row) => [
		row.label,
		...table.columns.map((column) =>
			formatConvertedAmount(row.values[column] ?? null, table.unit),
		),
	]);

	return [
		toMarkdownRow(header),
		toMarkdownRow(alignment),
		...rows.map(toMarkdownRow),
	].join('\n');
}

export function mergeMarkdownSections(sections: string[]): string {
	const nonEmptySections = sections.filter((section) => section.trim() !== '');
	return nonEmptySections.length === 0 ? '' : `${nonEmptySections.join('\n\n')}\n`;
}

function toMarkdownRow(cells: string[]): string {
	return `| ${cells.join(' | ')} |`;
}
