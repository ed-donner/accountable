"""GET /invoices/{id}/pdf: an issued invoice as a PDF, made now (V24).

It's drawn in the design, accent color and logo Company settings have at this moment (V13),
from the same layout as the preview. A draft has no PDF.
"""

from typing import Any

from fastapi import APIRouter, Response
from sqlalchemy import Row

from accountable import api, db
from accountable.company import documents
from accountable.invoices import layout, pdf, schemas
from accountable.invoices.routers.invoices import detail, refuse

router = APIRouter(prefix="/invoices")

# What each invoice shows as, as the mark near its title (V27). Issued and part paid have none.
MARKS = {"draft": "draft", "paid": "paid", "overdue": "overdue", "void": "void"}


def values(invoice: schemas.InvoiceDetail, settings: Row, logo: Row | None) -> dict[str, Any]:
    """The invoice as the layout takes it: plain values, as InvoicePreview.tsx gives layout.ts."""
    return {
        "design": settings.invoice_design,
        "accent": settings.accent_color,
        "logo": None if logo is None else {"width": logo.width, "height": logo.height},
        "company": invoice.company.model_dump(),
        "number": invoice.number,
        "issue_date": invoice.issue_date.isoformat() if invoice.issue_date else None,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "bill_to": invoice.bill_to,
        "lines": [
            {
                "name": line.name,
                "description": line.description,
                "quantity": line.quantity,
                "unit_price_cents": line.unit_price_cents,
            }
            for line in invoice.lines
        ],
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
    pages = layout.lay_out(values(invoice, settings, logo))
    made = pdf.draw(pages, title=invoice.number, logo=None if logo is None else logo.image)
    # A prefix has only letters, digits and hyphens (B4), so the name needs no escaping.
    disposition = f'attachment; filename="{invoice.number}.pdf"'
    return Response(made, media_type="application/pdf", headers={"Content-Disposition": disposition})
