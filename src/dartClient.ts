import { requestUrl } from 'obsidian';
import {
	DartDisclosureMeta,
	DartFinancialStatementItem,
	FsDivision,
	ReportKind,
} from './types';
import { getReceiptDate } from './dartUrl';

const DART_API_BASE = 'https://opendart.fss.or.kr/api';

interface DartApiResponse {
	status: string;
	message: string;
}

interface DisclosureListResponse extends DartApiResponse {
	list?: DisclosureListItem[];
	page_no?: number;
	total_page?: number;
}

interface DisclosureListItem {
	corp_code: string;
	report_nm: string;
	rcept_no: string;
	rcept_dt: string;
}

interface FinancialStatementResponse extends DartApiResponse {
	list?: DartFinancialStatementItem[];
}

interface ParsedReportInfo {
	businessYear: string;
	reportCode: string;
	reportKind: ReportKind;
}

export class DartClient {
	async findDisclosureMeta(
		apiKey: string,
		receiptNo: string,
	): Promise<DartDisclosureMeta> {
		const receiptDate = getReceiptDate(receiptNo);
		const item = await this.findDisclosureInPages(
			apiKey,
			receiptNo,
			receiptDate,
		);
		if (item === undefined) {
			throw new Error('URL에서 찾은 접수번호의 정기공시를 찾을 수 없습니다.');
		}

		const reportInfo = parseReportInfo(item.report_nm);
		if (reportInfo === null) {
			throw new Error('사업보고서, 반기보고서, 분기보고서만 지원합니다.');
		}

		return {
			corpCode: item.corp_code,
			reportName: item.report_nm,
			receiptNo: item.rcept_no,
			receiptDate: item.rcept_dt,
			businessYear: reportInfo.businessYear,
			reportCode: reportInfo.reportCode,
			reportKind: reportInfo.reportKind,
		};
	}

	private async findDisclosureInPages(
		apiKey: string,
		receiptNo: string,
		receiptDate: string,
	): Promise<DisclosureListItem | undefined> {
		let pageNo = 1;
		let totalPage = 1;

		do {
			const response = await this.getJson<DisclosureListResponse>('/list.json', {
				crtfc_key: apiKey,
				bgn_de: receiptDate,
				end_de: receiptDate,
				pblntf_ty: 'A',
				page_no: String(pageNo),
				page_count: '100',
			});

			ensureSuccess(response);

			const item = response.list?.find(
				(disclosure) => disclosure.rcept_no === receiptNo,
			);
			if (item !== undefined) {
				return item;
			}

			totalPage = normalizePageCount(response.total_page);
			pageNo += 1;
		} while (pageNo <= totalPage);

		return undefined;
	}

	async getFinancialStatementItems(
		apiKey: string,
		meta: DartDisclosureMeta,
		fsDivision: FsDivision,
	): Promise<DartFinancialStatementItem[]> {
		const response = await this.getJson<FinancialStatementResponse>(
			'/fnlttSinglAcntAll.json',
			{
				crtfc_key: apiKey,
				corp_code: meta.corpCode,
				bsns_year: meta.businessYear,
				reprt_code: meta.reportCode,
				fs_div: fsDivision,
			},
		);

		if (response.status === '013') {
			return [];
		}

		ensureSuccess(response);
		return response.list ?? [];
	}

	private async getJson<T>(
		path: string,
		params: Record<string, string>,
	): Promise<T> {
		const url = new URL(`${DART_API_BASE}${path}`);
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}

		const response = await requestUrl({
			url: url.toString(),
			method: 'GET',
		});

		return response.json as T;
	}
}

function ensureSuccess(response: DartApiResponse): void {
	if (response.status !== '000') {
		throw new Error(response.message || 'DART 데이터를 조회할 수 없습니다.');
	}
}

function normalizePageCount(value: number | string | undefined): number {
	if (typeof value === 'number') {
		return value;
	}

	if (typeof value === 'string') {
		const parsed = Number.parseInt(value, 10);
		return Number.isFinite(parsed) ? parsed : 1;
	}

	return 1;
}

function parseReportInfo(reportName: string): ParsedReportInfo | null {
	const businessYear = parseBusinessYear(reportName);
	if (businessYear === null) {
		return null;
	}

	if (reportName.includes('사업보고서')) {
		return {
			businessYear,
			reportCode: '11011',
			reportKind: 'annual',
		};
	}

	if (reportName.includes('반기보고서')) {
		return {
			businessYear,
			reportCode: '11012',
			reportKind: 'half',
		};
	}

	if (reportName.includes('분기보고서')) {
		const month = parseReportMonth(reportName);
		if (month === '03') {
			return {
				businessYear,
				reportCode: '11013',
				reportKind: 'q1',
			};
		}
		if (month === '09') {
			return {
				businessYear,
				reportCode: '11014',
				reportKind: 'q3',
			};
		}
	}

	return null;
}

function parseBusinessYear(reportName: string): string | null {
	const match = reportName.match(/\((\d{4})\.\d{2}\)/);
	return match?.[1] ?? null;
}

function parseReportMonth(reportName: string): string | null {
	const match = reportName.match(/\(\d{4}\.(\d{2})\)/);
	return match?.[1] ?? null;
}
