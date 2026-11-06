"""The sentence for each event an entry records (J4), written once when the entry is posted.

It imports nothing but the standard library, so posting and the tests share one wording.
"""

_WITH_DOCUMENT = {
    "invoice_issued": "Invoice {document} issued",
    "payment_recorded": "Payment received on {document}",
    "bill_added": "Bill {document}",
    "bill_paid": "Bill {document} paid",
    "invoice_voided": "Invoice {document} voided",
    "payment_deleted": "Payment deleted from {document}",
    "bill_changed": "Bill {document} changed",
    "bill_unpaid": "Bill {document} marked unpaid",
    "bill_deleted": "Bill {document} deleted",
}
_WITHOUT_DOCUMENT = {
    "invoice_issued": "Invoice issued",
    "payment_recorded": "Payment received",
    "bill_added": "Bill added",
    "bill_paid": "Bill paid",
    "invoice_voided": "Invoice voided",
    "payment_deleted": "Payment deleted",
    "bill_changed": "Bill changed",
    "bill_unpaid": "Bill marked unpaid",
    "bill_deleted": "Bill deleted",
}
_OPENING = {
    "opening_balance_set": "Opening balance set",
    "opening_balance_changed": "Opening balance changed",
    "opening_balance_cleared": "Opening balance cleared",
}


def describe(event: str, document: str | None, supplier: str | None = None) -> str:
    """A line of plain words for the event. A new bill's names its supplier when it's known."""
    if event in _OPENING:
        return _OPENING[event]
    if document is None:
        return _WITHOUT_DOCUMENT[event]
    if event == "bill_added" and supplier:
        return f"Bill {document} from {supplier}"
    return _WITH_DOCUMENT[event].format(document=document)
