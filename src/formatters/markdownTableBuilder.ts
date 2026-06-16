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
		`### ${table.title}`,
		'',
		`단위: ${table.unit}원`,
		'',
		toMarkdownRow(header),
		toMarkdownRow(alignment),
		...rows.map(toMarkdownRow),
	].join('\n');
}

export function mergeMarkdownSections(sections: string[]): string {
	return `${sections.join('\n\n')}\n`;
}

function toMarkdownRow(cells: string[]): string {
	return `| ${cells.join(' | ')} |`;
}
