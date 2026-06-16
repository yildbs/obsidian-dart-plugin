import { DartReportSearchResult } from '../types';

const DART_REPORT_BASE_URL = 'https://dart.fss.or.kr/dsaf001/main.do';

export function buildReportMarkdownLink(report: DartReportSearchResult): string {
	const url = buildReportUrl(report.receiptNo);
	const title = `${report.corpName}/${getReportKindLabel(report.reportKind)}/${formatReceiptDate(report.receiptDate)}`;
	return `[${title}](${url})`;
}

export function buildReportUrl(receiptNo: string): string {
	return `${DART_REPORT_BASE_URL}?rcpNo=${receiptNo}`;
}

function getReportKindLabel(reportKind: DartReportSearchResult['reportKind']): string {
	if (reportKind === 'annual') {
		return '사업보고서';
	}
	if (reportKind === 'half') {
		return '반기보고서';
	}
	return '분기보고서';
}

function formatReceiptDate(receiptDate: string): string {
	if (/^\d{8}$/.test(receiptDate)) {
		return `${receiptDate.slice(0, 4)}.${receiptDate.slice(4, 6)}.${receiptDate.slice(6, 8)}`;
	}
	return receiptDate;
}
