import { AmountUnit } from '../types';

const UNIT_DIVISORS: Record<AmountUnit, number> = {
	억: 100_000_000,
	조: 1_000_000_000_000,
};

export function convertAmount(valueInWon: number, unit: AmountUnit): number {
	const converted = valueInWon / UNIT_DIVISORS[unit];
	if (unit === '억') {
		return Math.round(converted);
	}
	return Math.round(converted * 100) / 100;
}

export function formatConvertedAmount(
	valueInWon: number | null,
	unit: AmountUnit,
): string {
	if (valueInWon === null) {
		return '-';
	}

	const converted = convertAmount(valueInWon, unit);
	return new Intl.NumberFormat('ko-KR', {
		maximumFractionDigits: unit === '조' ? 2 : 0,
		minimumFractionDigits: unit === '조' ? 2 : 0,
	}).format(converted);
}
