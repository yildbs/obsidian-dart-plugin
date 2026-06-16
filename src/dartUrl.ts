const RECEIPT_NO_PATTERN = /^\d{14}$/;

export function extractReceiptNo(input: string): string | null {
	const trimmed = input.trim();

	if (RECEIPT_NO_PATTERN.test(trimmed)) {
		return trimmed;
	}

	try {
		const url = new URL(trimmed);
		const receiptNo = url.searchParams.get('rcpNo') ?? url.searchParams.get('rcpno');
		if (receiptNo !== null && RECEIPT_NO_PATTERN.test(receiptNo)) {
			return receiptNo;
		}
	} catch {
		return null;
	}

	return null;
}

export function getReceiptDate(receiptNo: string): string {
	return receiptNo.slice(0, 8);
}
