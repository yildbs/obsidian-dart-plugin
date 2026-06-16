export type ExtractType =
	| 'consolidated_comprehensive_income'
	| 'separate_comprehensive_income';

export type AmountUnit = '억' | '조';

export type FsDivision = 'CFS' | 'OFS';

export type StatementDivision = 'CIS' | 'IS';

export type ReportKind = 'annual' | 'q1' | 'half' | 'q3';

export interface DartExtractRequest {
	apiKey: string;
	dartUrl: string;
	rcpNo: string;
	extractTypes: ExtractType[];
	unit: AmountUnit;
}

export interface DartReportSearchRequest {
	apiKey: string;
	companyName: string;
	corpCode: string;
	startDate: string;
	endDate: string;
	includeUrl: boolean;
	includeFinancialStatement: boolean;
	unit: AmountUnit;
}

export interface DartReportSearchResult {
	corpCode: string;
	corpName: string;
	reportName: string;
	reportKind: ReportKind;
	receiptNo: string;
	receiptDate: string;
	businessYear: string;
	reportCode: string;
}

export interface DartCompany {
	corpCode: string;
	corpName: string;
	stockCode: string;
	modifyDate: string;
}

export interface CorpCodeCache {
	updatedAt: string;
	companies: DartCompany[];
}

export interface DartDisclosureMeta {
	corpCode: string;
	corpName?: string;
	reportName: string;
	receiptNo: string;
	receiptDate: string;
	businessYear: string;
	reportCode: string;
	reportKind: ReportKind;
}

export interface IncomeStatementRow {
	label: string;
	values: Record<string, number | null>;
}

export interface IncomeStatementTable {
	title: string;
	unit: AmountUnit;
	columns: string[];
	rows: IncomeStatementRow[];
	sourceStatement: StatementDivision | 'CIS+IS';
}

export interface DartFinancialStatementItem {
	sj_div?: string;
	sj_nm?: string;
	account_id?: string;
	account_nm?: string;
	thstrm_amount?: string;
	thstrm_add_amount?: string;
	frmtrm_amount?: string;
	frmtrm_q_amount?: string;
	frmtrm_add_amount?: string;
	bfefrmtrm_amount?: string;
}
