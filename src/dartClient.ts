import { unzipSync, strFromU8 } from 'fflate';
import { requestUrl } from 'obsidian';
import {
	DartCompany,
	DartDisclosureMeta,
	DartFinancialStatementItem,
	DartReportSearchResult,
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
	corp_name: string;
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
			corpName: item.corp_name,
			reportName: item.report_nm,
			receiptNo: item.rcept_no,
			receiptDate: item.rcept_dt,
			businessYear: reportInfo.businessYear,
			reportCode: reportInfo.reportCode,
			reportKind: reportInfo.reportKind,
		};
	}

	async searchPeriodicReports(
		apiKey: string,
		corpCode: string,
		startDate: string,
		endDate: string,
	): Promise<DartReportSearchResult[]> {
		const disclosures = await this.getDisclosurePages(apiKey, {
			corp_code: corpCode,
			bgn_de: normalizeDate(startDate),
			end_de: normalizeDate(endDate),
			pblntf_ty: 'A',
			page_count: '100',
		});

		return disclosures
			.map(toReportSearchResult)
			.filter((report): report is DartReportSearchResult => report !== null)
			.sort((a, b) => b.receiptDate.localeCompare(a.receiptDate));
	}

	async downloadCompanies(apiKey: string): Promise<DartCompany[]> {
		const url = new URL(`${DART_API_BASE}/corpCode.xml`);
		url.searchParams.set('crtfc_key', apiKey);

		const response = await requestUrl({
			url: url.toString(),
			method: 'GET',
		});

		const files = unzipSync(new Uint8Array(response.arrayBuffer));
		const xmlFile = files['CORPCODE.xml'] ?? files['corpCode.xml'];
		if (xmlFile === undefined) {
			throw new Error('기업 리스트 파일을 찾을 수 없습니다.');
		}

		return parseCorpCodeXml(strFromU8(xmlFile));
	}

	private async findDisclosureInPages(
		apiKey: string,
		receiptNo: string,
		receiptDate: string,
	): Promise<DisclosureListItem | undefined> {
		const disclosures = await this.getDisclosurePages(apiKey, {
			bgn_de: receiptDate,
			end_de: receiptDate,
			pblntf_ty: 'A',
			page_count: '100',
		});

		return disclosures.find((disclosure) => disclosure.rcept_no === receiptNo);
	}

	private async getDisclosurePages(
		apiKey: string,
		params: Record<string, string>,
	): Promise<DisclosureListItem[]> {
		let pageNo = 1;
		let totalPage = 1;
		const disclosures: DisclosureListItem[] = [];

		do {
			const response = await this.getJson<DisclosureListResponse>('/list.json', {
				crtfc_key: apiKey,
				...params,
				page_no: String(pageNo),
			});

			ensureSuccess(response);
			disclosures.push(...(response.list ?? []));

			totalPage = normalizePageCount(response.total_page);
			pageNo += 1;
		} while (pageNo <= totalPage);

		return disclosures;
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

function toReportSearchResult(
	item: DisclosureListItem,
): DartReportSearchResult | null {
	const reportInfo = parseReportInfo(item.report_nm);
	if (reportInfo === null) {
		return null;
	}

	return {
		corpCode: item.corp_code,
		corpName: item.corp_name,
		reportName: item.report_nm,
		reportKind: reportInfo.reportKind,
		receiptNo: item.rcept_no,
		receiptDate: item.rcept_dt,
		businessYear: reportInfo.businessYear,
		reportCode: reportInfo.reportCode,
	};
}

function normalizeDate(value: string): string {
	return value.replaceAll(/[^0-9]/g, '');
}

function parseCorpCodeXml(xml: string): DartCompany[] {
	return [...xml.matchAll(/<list>([\s\S]*?)<\/list>/g)].map((match) => {
		const listXml = match[1] ?? '';
		return {
			corpCode: getXmlText(listXml, 'corp_code'),
			corpName: getXmlText(listXml, 'corp_name'),
			stockCode: getXmlText(listXml, 'stock_code'),
			modifyDate: getXmlText(listXml, 'modify_date'),
		};
	});
}

function getXmlText(xml: string, tagName: string): string {
	const match = xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`));
	return decodeXmlText(match?.[1]?.trim() ?? '');
}

function decodeXmlText(value: string): string {
	return value
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'");
}

function parseBusinessYear(reportName: string): string | null {
	const match = reportName.match(/\((\d{4})\.\d{2}\)/);
	return match?.[1] ?? null;
}

function parseReportMonth(reportName: string): string | null {
	const match = reportName.match(/\(\d{4}\.(\d{2})\)/);
	return match?.[1] ?? null;
}
