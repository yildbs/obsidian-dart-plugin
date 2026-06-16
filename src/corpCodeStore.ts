import { normalizePath, Vault } from 'obsidian';
import { CorpCodeCache, DartCompany } from './types';

const CORP_CODE_FILE_NAME = 'corp-codes.json';

export class CorpCodeStore {
	private readonly filePath: string;

	constructor(
		private readonly vault: Vault,
		pluginDir: string,
	) {
		this.filePath = normalizePath(`${pluginDir}/${CORP_CODE_FILE_NAME}`);
	}

	async load(): Promise<CorpCodeCache | null> {
		if (!(await this.vault.adapter.exists(this.filePath))) {
			return null;
		}

		const raw = await this.vault.adapter.read(this.filePath);
		return parseCorpCodeCache(raw);
	}

	async save(companies: DartCompany[]): Promise<CorpCodeCache> {
		const cache: CorpCodeCache = {
			updatedAt: new Date().toISOString(),
			companies,
		};

		await this.vault.adapter.write(
			this.filePath,
			JSON.stringify(cache, null, 2),
		);
		return cache;
	}
}

export function findCompaniesByName(
	companies: DartCompany[],
	query: string,
): DartCompany[] {
	const normalizedQuery = normalizeCompanyName(query);
	if (normalizedQuery === '') {
		return [];
	}

	return companies
		.filter((company) =>
			normalizeCompanyName(company.corpName).includes(normalizedQuery),
		)
		.sort((a, b) => compareCompanies(a, b, normalizedQuery));
}

function parseCorpCodeCache(raw: string): CorpCodeCache {
	const parsed = JSON.parse(raw) as Partial<CorpCodeCache>;
	if (!Array.isArray(parsed.companies) || typeof parsed.updatedAt !== 'string') {
		throw new Error('기업 리스트 캐시 형식이 올바르지 않습니다.');
	}

	return {
		updatedAt: parsed.updatedAt,
		companies: parsed.companies,
	};
}

function compareCompanies(
	a: DartCompany,
	b: DartCompany,
	normalizedQuery: string,
): number {
	const aName = normalizeCompanyName(a.corpName);
	const bName = normalizeCompanyName(b.corpName);
	const aExact = aName === normalizedQuery ? 0 : 1;
	const bExact = bName === normalizedQuery ? 0 : 1;
	if (aExact !== bExact) {
		return aExact - bExact;
	}

	const aListed = a.stockCode === '' ? 1 : 0;
	const bListed = b.stockCode === '' ? 1 : 0;
	if (aListed !== bListed) {
		return aListed - bListed;
	}

	return a.corpName.localeCompare(b.corpName, 'ko');
}

function normalizeCompanyName(value: string): string {
	return value
		.replaceAll(/\s/g, '')
		.replaceAll('주식회사', '')
		.replaceAll('(주)', '')
		.replaceAll('㈜', '')
		.toLowerCase();
}
