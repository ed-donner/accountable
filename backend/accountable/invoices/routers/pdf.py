"""GET /invoices/{id}/pdf: an issued invoice as a PDF, made now (V24).

It's drawn in the design, accent color and logo Company settings have at this moment (V13),
from the same layout as the preview and as quotes' PDFs. A draft has no PDF.
"""

from typing import Any

from fastapi import APIRouter, Response
from sqlalchemy import Row

from accountable import api, db
from accountable.company import documents, pdf
from accountable.invoices import schemas
from accountable.invoices.routers.invoices import detail, refuse

router = APIRouter(prefix="/invoices")

# What each invoice shows as, as the mark near its title (V27). Issued and part paid have none.
MARKS = {"draft": "draft", "paid": "paid", "overdue": "overdue", "void": "void"}


def values(invoice: schemas.InvoiceDetail, settings: Row, logo: Row | None) -> dict[str, Any]:
    """The invoice as the layout takes it: plain values, as the invoice's page gives layout.ts."""
    return {
        "kind": "invoice",
        **pdf.look(settings, logo),
        "company": invoice.company.model_dump(),
        "number": invoice.number,
        "date": invoice.issue_date.isoformat() if invoice.issue_date else None,
        "end_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "recipient": invoice.bill_to,
        "lines": [line.model_dump() for line in invoice.lines],
        "subtotal_cents": invoice.subtotal_cents,
        "tax_cents": invoice.tax_cents,
        "total_cents": invoice.total_cents,
        "paid_cents": invoice.paid_cents,
        "tax_label": invoice.tax_label,
        "tax_rate": invoice.tax_rate,
        "mark": MARKS.get(invoice.shows_as),
    }


@router.get("/{invoice_id}/pdf")
def invoice_pdf(invoice_id: api.PathId, today: api.Today) -> Response:
    with db.reading() as conn:
        invoice = detail(conn, invoice_id, today)
        settings = documents.current_settings(conn)
        logo = documents.current_logo(conn)
    if invoice.number is None:
        raise refuse(schemas.DRAFT_HAS_NO_PDF)
    return pdf.download(values(invoice, settings, logo), logo)
