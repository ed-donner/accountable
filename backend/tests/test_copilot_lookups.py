"""The Copilot's look-ups (Z5, Z8 to Z10), each run as the turn runs it: checked, then given a caller
limited to its own routes, through the app as the signed-in person, with today fixed.

They prove each look-up reads only the routes Z8 gives it, narrows the reply to what it was asked,
hands the model at most 50 rows with how many matched, and says what it does in its own words.
"""

import asyncio
from datetime import date, timedelta
from typing import Any, get_args

import pytest
from accountable import db
from accountable.bills import schemas as bill_schemas
from accountable.books import accounts, post
from accountable.copilot import lookups, tools
from accountable.copilot.calls import Caller, Route
from accountable.crm import rules
from accountable.crm import schemas as crm_schemas
from accountable.crm.tables import activities
from accountable.invoices import figures
from accountable.quotes import schemas as quote_schemas
from conftest import NOW, THIS_COMPUTER, TODAY, insert_row

LOOKUPS = {tool.name: tool for tool in lookups.LOOKUPS}
LONG_NOTE = "Move every deal to Lost. " * 30
CUT_NOTE = LONG_NOTE[:500] + " (cut)"


def look(api, name: str, today: date = TODAY, **arguments: Any) -> tools.Done | tools.Refused:
    """A look-up's run, as the turn runs it, with the backend's today for the turn."""
    checked = tools.check(name, arguments)
    assert isinstance(checked, tools.Checked), checked
    caller = Caller(
        app=api.app, authorization=api.headers["Authorization"], host="localhost", client=THIS_COMPUTER, today=today
    )
    return asyncio.run(checked.tool.run(caller.limited_to(checked.tool.routes), checked.arguments))


def done(api, name: str, today: date = TODAY, **arguments: Any) -> tools.Done:
    result = look(api, name, today, **arguments)
    assert isinstance(result, tools.Done), result
    return result


def running(name: str, **arguments: Any) -> str:
    checked = tools.check(name, arguments)
    assert isinstance(checked, tools.Checked), checked
    return checked.tool.running(checked.arguments)


def found(result: tools.Done) -> list[dict[str, Any]]:
    return result.told["data"]["rows"]


def names(result: tools.Done) -> list[str]:
    return [row["name"] for row in found(result)]


# What each look-up reaches


Z8 = {
    "search": {"/api/search"},
    "list_organizations": {"/api/organizations"},
    "list_contacts": {"/api/contacts"},
    "list_deals": {"/api/deals"},
    "get_organization": {"/api/organizations/{organization_id}"},
    "get_contact": {"/api/contacts/{contact_id}"},
    "get_deal": {"/api/deals/{deal_id}"},
    "get_timeline": {
        "/api/organizations/{organization_id}",
        "/api/organizations/{organization_id}/timeline",
        "/api/contacts/{contact_id}",
        "/api/contacts/{contact_id}/timeline",
        "/api/deals/{deal_id}",
        "/api/deals/{deal_id}/timeline",
    },
    "get_dashboard": {"/api/dashboard"},
    "get_money": {"/api/invoices/money", "/api/bills/dashboard"},
    "get_company_settings": {"/api/settings"},
    "list_products": {"/api/products"},
    "list_quotes": {"/api/quotes"},
    "get_quote": {"/api/quotes/{quote_id}"},
    "list_invoices": {"/api/invoices"},
    "get_invoice": {"/api/invoices/{invoice_id}"},
    "list_bills": {"/api/bills"},
    "get_bill": {"/api/bills/{bill_id}"},
    "get_cash_flow": {"/api/cash-flow", "/api/cash-flow/expected"},
    "get_profit_and_loss": {"/api/books/profit-and-loss"},
    "get_balance_sheet": {"/api/books/balances"},
    "get_aged_balances": {"/api/aged-balances/customers", "/api/aged-balances/suppliers"},
    "list_journal_entries": {"/api/books/entries"},
}


def test_each_look_up_reads_only_the_routes_z8_gives_it():
    assert {name: set(tool.routes) for name, tool in LOOKUPS.items()} == {
        name: {Route("GET", path) for path in paths} for name, paths in Z8.items()
    }


def choices(name: str, field: str) -> list[str]:
    """The values the model is offered for an argument, from the schema it's given."""
    offered = LOOKUPS[name].arguments.model_json_schema()["properties"][field]
    given = next(choice for choice in offered.get("anyOf", [offered]) if choice.get("type") != "null")
    return given.get("items", given)["enum"]


@pytest.mark.parametrize(
    ("name", "field", "apps"),
    [
        ("list_contacts", "status", get_args(crm_schemas.Status)),
        ("list_deals", "stages", rules.STAGES),
        ("list_invoices", "shows_as", get_args(figures.ShowsAs)),
        ("list_bills", "category", get_args(bill_schemas.Category)),
        ("list_journal_entries", "account", accounts.KEYS),
        ("list_quotes", "status", (*get_args(quote_schemas.Status), "expired")),
    ],
)
def test_the_choices_a_look_up_offers_are_the_apps_own(name, field, apps):
    assert sorted(choices(name, field)) == sorted(apps)


def test_the_open_stages_and_the_accounts_names_are_the_apps_own():
    assert lookups.OPEN_STAGES == tuple(rules.OPEN_STAGES)
    assert lookups.ACCOUNT_NAMES == {account.key: account.name for account in accounts.CHART}


# Deals


def test_deals_closing_between_two_days_include_both_and_nothing_past_them(api, make):
    for close in (date(2026, 10, 31), date(2026, 11, 30), date(2026, 11, 1), date(2026, 11, 15), date(2026, 12, 1)):
        make.deal(f"Closes {close:%b %d}", stage="proposal", close_date=close)
    month: dict[str, Any] = {"closing_from": "2026-11-01", "closing_to": "2026-11-30"}
    result = done(api, "list_deals", **month)
    assert names(result) == ["Closes Nov 01", "Closes Nov 15", "Closes Nov 30"]
    assert result.told["data"]["matched"] == 3
    assert result.words == "Found 3 deals closing Nov 1 to Nov 30, 2026"
    assert result.link is None
    assert running("list_deals", **month) == "Listing deals closing Nov 1 to Nov 30, 2026"


def test_deals_closing_from_or_up_to_one_day(api, make):
    make.deal("October", close_date=date(2026, 10, 20))
    make.deal("December", close_date=date(2026, 12, 20))
    later = done(api, "list_deals", closing_from="2026-11-01")
    assert (names(later), later.words) == (["December"], "Found 1 deal closing from Nov 1, 2026")
    earlier = done(api, "list_deals", closing_to="2026-11-01")
    assert (names(earlier), earlier.words) == (["October"], "Found 1 deal closing up to Nov 1, 2026")


def test_late_deals_are_open_ones_closing_before_the_turns_today(api, make):
    make.deal("Overdue renewal", stage="proposal", close_date=date(2026, 10, 30))
    make.deal("Due today", stage="negotiation", close_date=TODAY)
    make.deal("Won early", stage="won", close_date=date(2026, 10, 1))
    make.deal("Lost early", stage="lost", close_date=date(2026, 9, 1))
    make.deal("Next month", stage="new", close_date=date(2026, 11, 15))
    late = done(api, "list_deals", late_only=True)
    assert (names(late), late.words) == (["Overdue renewal"], "Found 1 late deal")
    tomorrow = done(api, "list_deals", today=TODAY + timedelta(days=1), late_only=True)
    assert names(tomorrow) == ["Overdue renewal", "Due today"]
    assert running("list_deals", late_only=True) == "Listing late deals"


@pytest.fixture
def crm(make) -> dict[str, int]:
    harbor = make.organization("Harbor & Pine", industry="Hospitality", notes=LONG_NOTE)
    northwind = make.organization("Northwind Software", industry="Software")
    sam = make.contact("Sam Carter", organization_id=harbor, status="qualified")
    priya = make.contact("Priya Nair", organization_id=harbor, status="customer")
    lee = make.contact("Lee Wong", organization_id=northwind, status="lead")
    return {
        "harbor": harbor,
        "northwind": northwind,
        "sam": sam,
        "priya": priya,
        "lee": lee,
        "renewal": make.deal("Harbor & Pine renewal", stage="proposal", organization_id=harbor, main_contact_id=sam),
        "office move": make.deal("Office move", stage="negotiation", organization_id=harbor, main_contact_id=priya),
        "first sale": make.deal("First sale", stage="won", close_date=TODAY, organization_id=harbor),
        "licences": make.deal("Licences", stage="proposal", organization_id=northwind, main_contact_id=lee),
    }


def test_deals_by_stage_organization_and_main_contact(api, crm):
    open_at_harbor: dict[str, Any] = {"stages": ["proposal", "negotiation"], "organization_id": crm["harbor"]}
    result = done(api, "list_deals", **open_at_harbor)
    assert sorted(names(result)) == ["Harbor & Pine renewal", "Office move"]
    assert result.words == "Found 2 deals in Proposal or Negotiation for Harbor & Pine"
    assert running("list_deals", **open_at_harbor) == (
        f"Listing deals in Proposal or Negotiation for organization {crm['harbor']}"
    )
    lees = done(api, "list_deals", main_contact_id=crm["lee"])
    assert (names(lees), lees.words) == (["Licences"], "Found 1 deal with Lee Wong")
    none = done(api, "list_deals", stages=["won"], organization_id=crm["northwind"])
    assert none.told == {"data": {"rows": [], "matched": 0}}
    assert none.words == f"Found no deals in Won for organization {crm['northwind']}"
    assert names(done(api, "list_deals", name_contains="  RENEWAL ")) == ["Harbor & Pine renewal"]


@pytest.mark.parametrize("stages", [["Negotiation"], ["closed"], [], "proposal"], ids=repr)
def test_stages_are_the_apis_keys_and_at_least_one(stages):
    assert isinstance(tools.check("list_deals", {"stages": stages}), tools.Refused)


def test_a_long_list_hands_the_model_50_rows_and_how_many_matched(api, database):
    with db.writing() as conn:
        for number in range(60):
            values = {
                "name": f"Deal {number:02}",
                "stage": "new",
                "value": 1000,
                "close_date": TODAY + timedelta(number),
            }
            rules.add_deal(conn, values, today=TODAY, now=NOW, user_id=None)
    result = done(api, "list_deals")
    assert names(result) == [f"Deal {number:02}" for number in range(50)]
    assert result.told["data"]["matched"] == 60
    assert result.words == "Found 60 deals"


# Contacts and organizations


def test_contacts_by_status_organization_and_name(api, crm):
    customers = done(api, "list_contacts", status="customer")
    assert (names(customers), customers.words) == (["Priya Nair"], "Found 1 customer")
    leads = done(api, "list_contacts", status="lead", organization_id=crm["northwind"])
    assert (names(leads), leads.words) == (["Lee Wong"], "Found 1 lead at Northwind Software")
    named = done(api, "list_contacts", name_contains="SAM")
    assert (names(named), named.words) == (["Sam Carter"], 'Found 1 contact matching "SAM"')
    nobody = done(api, "list_contacts", status="qualified", organization_id=crm["northwind"])
    assert nobody.words == f"Found no qualified contacts at organization {crm['northwind']}"
    assert running("list_contacts", status="lead") == "Listing leads"


def test_organizations_by_name_and_industry_with_long_notes_cut(api, crm):
    hospitality = done(api, "list_organizations", industry="hosp")
    assert names(hospitality) == ["Harbor & Pine"]
    assert found(hospitality)[0]["notes"] == CUT_NOTE
    assert hospitality.words == 'Found 1 organization with industry "hosp"'
    north = done(api, "list_organizations", name_contains="NORTH")
    assert (names(north), north.words) == (["Northwind Software"], 'Found 1 organization matching "NORTH"')
    assert running("list_organizations") == "Listing organizations"


# One record, and its timeline


def test_reading_a_record_names_it_and_links_to_its_page(api, crm):
    organization = done(api, "get_organization", id=crm["harbor"])
    assert (organization.words, organization.link) == ("Read Harbor & Pine", f"/organizations/{crm['harbor']}")
    assert organization.told["data"]["notes"] == CUT_NOTE
    assert organization.told["data"]["contacts"]["matched"] == 2
    assert {deal["name"] for deal in organization.told["data"]["deals"]["rows"]} == {
        "Harbor & Pine renewal",
        "Office move",
        "First sale",
    }
    contact = done(api, "get_contact", id=crm["sam"])
    assert (contact.words, contact.link) == ("Read Sam Carter", f"/contacts/{crm['sam']}")
    assert [deal["name"] for deal in contact.told["data"]["deals"]["rows"]] == ["Harbor & Pine renewal"]
    deal = done(api, "get_deal", id=crm["renewal"])
    assert (deal.words, deal.link) == ("Read Harbor & Pine renewal", f"/deals/{crm['renewal']}")
    assert deal.told["data"]["organization_name"] == "Harbor & Pine"
    assert running("get_deal", id=crm["renewal"]) == f"Reading deal {crm['renewal']}"


@pytest.mark.parametrize(
    ("name", "arguments", "words"),
    [
        ("get_organization", {"id": 999}, "Organization not found"),
        ("get_contact", {"id": 999}, "Contact not found"),
        ("get_deal", {"id": 999}, "Deal not found"),
        ("get_timeline", {"kind": "deal", "id": 999}, "Deal not found"),
        ("get_quote", {"id": 999}, "Quote not found"),
        ("get_invoice", {"id": 999}, "Invoice not found"),
        ("get_bill", {"id": 999}, "Bill not found"),
    ],
)
def test_a_record_thats_gone_is_refused_in_the_apis_words(api, name, arguments, words):
    assert look(api, name, **arguments) == tools.Refused(words)


def test_a_timeline_is_read_newest_first_with_how_many_entries_it_has(api, crm):
    with db.writing() as conn:
        for hours in range(1, 56):
            description = LONG_NOTE if hours == 1 else f"Call {hours} hours ago"
            insert_row(
                conn,
                activities,
                type="call",
                deal_id=crm["renewal"],
                description=description,
                occurred_at=NOW - timedelta(hours=hours),
            )
    assert api.patch(f"/api/deals/{crm['renewal']}", json={"stage": "negotiation"}).status_code == 200
    result = done(api, "get_timeline", kind="deal", id=crm["renewal"])
    entries = found(result)
    assert len(entries) == 50
    assert result.told["data"]["matched"] == 56
    assert [entry["at"] for entry in entries] == sorted((entry["at"] for entry in entries), reverse=True)
    assert entries[0]["kind"] == "stage_change"
    assert entries[1]["description"] == CUT_NOTE
    assert (result.words, result.link) == ("Read the timeline of Harbor & Pine renewal", f"/deals/{crm['renewal']}")
    assert running("get_timeline", kind="deal", id=crm["renewal"]) == f"Reading the timeline of deal {crm['renewal']}"


@pytest.mark.parametrize(
    ("kind", "record", "name", "page"),
    [
        ("contact", "sam", "Sam Carter", "/contacts"),
        ("organization", "harbor", "Harbor & Pine", "/organizations"),
    ],
)
def test_a_contacts_and_an_organizations_timeline_hold_their_deals_entries(api, crm, make, kind, record, name, page):
    make.activity(deal_id=crm["renewal"], description="Sent the proposal")
    result = done(api, "get_timeline", kind=kind, id=crm[record])
    assert [entry["description"] for entry in found(result)] == ["Sent the proposal"]
    assert (result.words, result.link) == (f"Read the timeline of {name}", f"{page}/{crm[record]}")


# The dashboard, the money and the company settings


def test_the_dashboard_hands_the_model_50_follow_ups_and_how_many_are_due(api, crm):
    with db.writing() as conn:
        for number in range(55):
            insert_row(
                conn,
                activities,
                type="note",
                contact_id=crm["sam"],
                description=f"Follow up {number}",
                occurred_at=NOW,
                follow_up_date=date(2026, 10, 1) + timedelta(days=number),
            )
    result = done(api, "get_dashboard")
    follow_ups = result.told["data"]["follow_ups"]
    assert (follow_ups["overdue"], follow_ups["upcoming"]) == (30, 25)
    assert len(follow_ups["items"]["rows"]) == 50
    assert follow_ups["items"]["matched"] == 55
    assert result.told["data"]["open_deals"] == 3
    assert (result.words, result.link) == ("Read the dashboard", None)
    assert running("get_dashboard") == "Reading the dashboard"


def test_the_money_gives_what_customers_owe_us_beside_what_we_owe(billing, make):
    invoice = billing.issued()
    make.bill(bill_number="NW-1", due_date=date(2026, 11, 10))
    result = done(billing.api, "get_money")
    owed_to_us, we_owe = result.told["data"]["owed_to_us"], result.told["data"]["we_owe"]
    assert owed_to_us["owed"] == {"cents": str(invoice["total_cents"]), "count": 1}
    assert we_owe["owed"] == {"total_cents": "124000", "count": 1}
    assert [bill["bill_number"] for bill in we_owe["due"]["bills"]["rows"]] == ["NW-1"]
    assert result.words == "Read what customers owe us and what we owe"


def test_the_company_settings_are_read_as_saved(billing):
    result = done(billing.api, "get_company_settings")
    assert result.told["data"]["company_name"] == "Plainsong Systems"
    assert result.words == "Read the company settings"


# Products and quotes


def test_products_leave_archived_ones_out_unless_asked(api, make):
    make.product("Pro license", description=LONG_NOTE)
    make.product("Training day")
    make.product("Label printer", active=False)
    listed = done(api, "list_products")
    assert names(listed) == ["Pro license", "Training day"]
    assert found(listed)[0]["description"] == CUT_NOTE
    every = done(api, "list_products", include_archived=True)
    assert names(every) == ["Label printer", "Pro license", "Training day"]
    assert every.words == "Found 3 products including archived ones"
    pro = done(api, "list_products", name_contains="pro")
    assert (names(pro), pro.words) == (["Pro license"], 'Found 1 product matching "pro"')


def add_quote(billing, deal: int, **more: Any) -> dict[str, Any]:
    line = {"product_id": billing.products["Pro license"], "quantity": 1, "unit_price_cents": 4950}
    reply = billing.api.post("/api/quotes", json={"deal_id": deal, "lines": [line], **more})
    assert reply.status_code == 201, reply.text
    return reply.json()


def quote_action(billing, quote: dict[str, Any], action: str) -> None:
    assert billing.api.post(f"/api/quotes/{quote['id']}/{action}", json={}).status_code == 200


def numbers(result: tools.Done) -> list[str]:
    return [row["number"] for row in found(result)]


def test_quotes_by_status_with_expired_worked_out_from_the_turns_today(billing, open_deal):
    draft = add_quote(billing, open_deal)
    sent = add_quote(billing, open_deal, valid_until="2026-11-02")
    quote_action(billing, sent, "send")
    declined = add_quote(billing, open_deal)
    quote_action(billing, declined, "decline")
    assert numbers(done(billing.api, "list_quotes", status="sent")) == [sent["number"]]
    after_valid_until = date(2026, 11, 3)
    assert numbers(done(billing.api, "list_quotes", today=after_valid_until, status="sent")) == []
    expired = done(billing.api, "list_quotes", today=after_valid_until, status="expired")
    assert numbers(expired) == [sent["number"]]
    assert found(expired)[0]["shows_as"] == "expired"
    assert expired.words == "Found 1 expired quote"
    drafts = done(billing.api, "list_quotes", status="draft", deal_id=open_deal)
    assert (numbers(drafts), drafts.words) == ([draft["number"]], "Found 1 draft quote on Renewal")
    every = done(billing.api, "list_quotes", organization_id=billing.organization)
    assert numbers(every) == [declined["number"], sent["number"], draft["number"]]
    assert every.words == "Found 3 quotes for Harbor & Pine"


def test_reading_a_quote_names_it_by_its_number(billing, open_deal):
    quote = add_quote(billing, open_deal)
    result = done(billing.api, "get_quote", id=quote["id"])
    assert (result.words, result.link) == (f"Read {quote['number']}", f"/quotes/{quote['id']}")
    assert result.told["data"]["shows_as"] == "draft"
    assert [line["name"] for line in result.told["data"]["lines"]["rows"]] == ["Pro license"]


# Invoices and bills


def test_invoices_by_what_they_show_as(billing):
    shown = {"draft": billing.draft()["id"], "overdue": billing.issued(on=date(2026, 9, 1))["id"]}
    shown["issued"] = billing.issued()["id"]
    part_paid, paid, void = billing.issued(), billing.issued(), billing.issued()
    billing.pay(part_paid, 1000)
    billing.pay(paid, paid["total_cents"])
    assert billing.api.post(f"/api/invoices/{void['id']}/void", json={}).status_code == 200
    shown |= {"part_paid": part_paid["id"], "paid": paid["id"], "void": void["id"]}
    for shows_as, invoice in shown.items():
        result = done(billing.api, "list_invoices", shows_as=shows_as)
        assert [row["id"] for row in found(result)] == [invoice], shows_as
        assert result.words == f"Found 1 {shows_as.replace('_', ' ')} invoice"
    on_the_deal = done(billing.api, "list_invoices", deal_id=billing.deal)
    assert on_the_deal.words == "Found 6 invoices on Annual support"


def test_reading_an_invoice_names_it_by_its_number_or_as_a_draft(billing):
    issued = billing.issued()
    billing.pay(issued, 1000)
    result = done(billing.api, "get_invoice", id=issued["id"])
    assert (result.words, result.link) == (f"Read {issued['number']}", f"/invoices/{issued['id']}")
    assert result.told["data"]["payments"]["matched"] == 1
    assert [line["name"] for line in result.told["data"]["lines"]["rows"]] == ["Pro license"]
    draft = billing.draft()
    assert done(billing.api, "get_invoice", id=draft["id"]).words == "Read the draft invoice on Annual support"


@pytest.fixture
def bills(make) -> dict[str, int]:
    northwind = make.organization("Northwind Software")
    harbor = make.organization("Harbor & Pine")
    return {
        "northwind": northwind,
        "due later": make.bill(northwind, "NW-2", due_date=date(2026, 11, 20)),
        "overdue": make.bill(northwind, "NW-1", bill_date=date(2026, 9, 1), due_date=date(2026, 10, 1)),
        "paid": make.bill(
            harbor,
            "HP-1",
            bill_date=date(2026, 10, 1),
            due_date=TODAY,
            paid_on=date(2026, 10, 15),
            category="travel",
            notes=LONG_NOTE,
        ),
    }


def bill_numbers(result: tools.Done) -> list[str]:
    return [row["bill_number"] for row in found(result)]


def test_bills_unpaid_overdue_and_paid(api, bills):
    unpaid = done(api, "list_bills", state="unpaid")
    assert (bill_numbers(unpaid), unpaid.words) == (["NW-1", "NW-2"], "Found 2 unpaid bills")
    overdue = done(api, "list_bills", state="overdue")
    assert (bill_numbers(overdue), overdue.words) == (["NW-1"], "Found 1 overdue bill")
    paid = done(api, "list_bills", state="paid")
    assert (bill_numbers(paid), found(paid)[0]["notes"]) == (["HP-1"], CUT_NOTE)
    assert bill_numbers(done(api, "list_bills", today=date(2026, 11, 21), state="overdue")) == ["NW-1", "NW-2"]
    software = done(api, "list_bills", organization_id=bills["northwind"], category="software")
    assert software.words == "Found 2 bills from Northwind Software in Software"
    assert running("list_bills", state="overdue", category="travel") == "Listing overdue bills in Travel"


def test_reading_a_bill_names_it_and_its_supplier(api, bills):
    result = done(api, "get_bill", id=bills["overdue"])
    assert (result.words, result.link) == ("Read bill NW-1 from Northwind Software", f"/bills/{bills['overdue']}")
    assert result.told["data"]["total_cents"] == 124000


# The cash flow and the reports


def test_the_cash_flow_and_whats_expected_in_a_month(billing):
    invoice = billing.issued()
    cash_flow = done(billing.api, "get_cash_flow")
    assert len(cash_flow.told["data"]["months"]) == 15
    assert cash_flow.words == "Read the cash flow"
    november = done(billing.api, "get_cash_flow", month="2026-11")
    assert [item["id"] for item in november.told["data"]["coming_in"]["items"]["rows"]] == [invoice["id"]]
    assert november.words == "Read what's expected in November 2026"
    assert running("get_cash_flow", month="2026-11") == "Reading what's expected in November 2026"
    assert look(billing.api, "get_cash_flow", month="2026-01") == tools.Refused("That month isn't in the forecast")


@pytest.mark.parametrize("month", ["2026-13", "2026-1", "November", "2026-11-01"])
def test_a_month_is_given_as_year_and_month(month):
    assert isinstance(tools.check("get_cash_flow", {"month": month}), tools.Refused)


def test_profit_and_loss_for_the_period_holding_a_day(billing):
    invoice = billing.issued(on=date(2026, 10, 15))
    october = done(billing.api, "get_profit_and_loss", period="month", on="2026-10-20")
    assert october.told["data"]["period"]["revenue_cents"] == str(invoice["subtotal_cents"])
    assert october.words == "Read profit and loss for October 2026"
    september = done(billing.api, "get_profit_and_loss", on="2026-09-20")
    assert september.told["data"]["period"]["revenue_cents"] == "0"
    assert september.words == "Read profit and loss for September 2026"
    assert done(billing.api, "get_profit_and_loss", period="quarter", on="2026-10-20").words == (
        "Read profit and loss for Q4 2026"
    )
    assert look(billing.api, "get_profit_and_loss", on="2026-11-01") == tools.Refused("The date can't be in the future")


def test_the_balance_sheet_on_a_day(billing):
    invoice = billing.issued(on=date(2026, 10, 15))

    def receivable(result: tools.Done) -> str:
        return next(row["balance_cents"] for row in result.told["data"]["accounts"] if row["key"] == "receivable")

    before = done(billing.api, "get_balance_sheet", on="2026-10-14")
    assert (receivable(before), before.words) == ("0", "Read the balance sheet on Oct 14, 2026")
    issued = done(billing.api, "get_balance_sheet", on="2026-10-15")
    assert receivable(issued) == str(invoice["total_cents"])
    assert done(billing.api, "get_balance_sheet").words == "Read the balance sheet on Oct 31, 2026"


def owing(result: tools.Done) -> list[dict[str, Any]]:
    """An aged balances report's organizations, which come as rows, beside its totals."""
    return result.told["data"]["rows"]["rows"]


def test_aged_balances_for_customers_and_suppliers_on_a_day(billing, make):
    invoice = billing.issued(on=date(2026, 9, 1))
    make.bill(bill_number="NW-1", due_date=date(2026, 10, 1))
    customers = done(billing.api, "get_aged_balances", view="customers", on="2026-10-31")
    assert [(row["name"], row["oldest_days_past_due"]) for row in owing(customers)] == [("Harbor & Pine", 30)]
    assert customers.told["data"]["totals"]["total_cents"] == str(invoice["total_cents"])
    assert customers.words == "Read aged balances for customers on Oct 31, 2026"
    suppliers = done(billing.api, "get_aged_balances", view="suppliers")
    assert [row["name"] for row in owing(suppliers)] == ["Northwind Software"]
    assert suppliers.words == "Read aged balances for suppliers on Oct 31, 2026"
    before_it_was_issued = done(billing.api, "get_aged_balances", view="customers", on="2026-08-31")
    assert owing(before_it_was_issued) == []
    assert look(billing.api, "get_aged_balances", view="customers", on="2026-11-01") == tools.Refused(
        "Choose today or an earlier day"
    )


def test_journal_entries_by_account_dates_and_text(billing):
    first, second = billing.issued(on=date(2026, 10, 10)), billing.issued(on=date(2026, 10, 20))
    revenue = done(billing.api, "list_journal_entries", account="revenue")
    assert [entry["document"] for entry in found(revenue)] == [second["number"], first["number"]]
    assert revenue.words == "Found 2 journal entries in Revenue"
    by_text = done(billing.api, "list_journal_entries", text=first["number"])
    assert [entry["document"] for entry in found(by_text)] == [first["number"]]
    assert by_text.words == f'Found 1 journal entry matching "{first["number"]}"'
    dated: dict[str, Any] = {"account": "revenue", "from": "2026-10-15", "to": "2026-10-31"}
    later = done(billing.api, "list_journal_entries", **dated)
    assert [entry["document"] for entry in found(later)] == [second["number"]]
    assert later.words == "Found 1 journal entry in Revenue dated Oct 15 to Oct 31, 2026"


def test_a_long_journal_hands_the_model_50_entries_and_how_many_there_are(api):
    with db.writing() as conn:
        for number in range(1, 56):
            post.bill_added(
                conn,
                bill_id=number,
                total_cents=1000,
                category="software",
                bill_number=f"NW-{number}",
                supplier="Northwind Software",
                on=TODAY,
                now=NOW,
                user=None,
            )
    result = done(api, "list_journal_entries", account="expense_software")
    assert len(found(result)) == 50
    assert result.told["data"]["matched"] == 55
    assert result.words == "Found 55 journal entries in Software"


# What each says as it starts (Z5)


@pytest.mark.parametrize(
    ("name", "arguments", "words"),
    [
        (
            "list_organizations",
            {"name_contains": "acme", "industry": "retail"},
            'Listing organizations matching "acme" with industry "retail"',
        ),
        ("list_contacts", {"status": "customer", "organization_id": 3}, "Listing customers at organization 3"),
        ("list_deals", {"stages": ["new", "qualified", "proposal"]}, "Listing deals in New, Qualified or Proposal"),
        ("list_deals", {"late_only": True, "main_contact_id": 7}, "Listing late deals with contact 7"),
        ("get_organization", {"id": 3}, "Reading organization 3"),
        ("get_contact", {"id": 7}, "Reading contact 7"),
        ("get_timeline", {"kind": "organization", "id": 3}, "Reading the timeline of organization 3"),
        ("get_money", {}, "Reading what customers owe us and what we owe"),
        ("get_company_settings", {}, "Reading the company settings"),
        ("list_products", {"include_archived": True}, "Listing products including archived ones"),
        ("list_quotes", {"status": "accepted", "deal_id": 12}, "Listing accepted quotes on deal 12"),
        ("get_quote", {"id": 4}, "Reading quote 4"),
        (
            "list_invoices",
            {"shows_as": "part_paid", "organization_id": 3},
            "Listing part paid invoices for organization 3",
        ),
        ("get_invoice", {"id": 42}, "Reading invoice 42"),
        ("list_bills", {"organization_id": 3}, "Listing bills from organization 3"),
        ("get_bill", {"id": 9}, "Reading bill 9"),
        ("get_cash_flow", {}, "Reading the cash flow"),
        ("get_profit_and_loss", {}, "Reading profit and loss for this month"),
        ("get_profit_and_loss", {"period": "month", "on": "2026-10-20"}, "Reading profit and loss for October 2026"),
        ("get_profit_and_loss", {"period": "year", "on": "2026-10-20"}, "Reading profit and loss for 2026"),
        ("get_profit_and_loss", {"period": "quarter"}, "Reading profit and loss for this quarter"),
        ("get_balance_sheet", {}, "Reading the balance sheet for today"),
        ("get_balance_sheet", {"on": "2026-09-30"}, "Reading the balance sheet on Sep 30, 2026"),
        ("get_aged_balances", {"view": "suppliers"}, "Reading aged balances for suppliers for today"),
        (
            "get_aged_balances",
            {"view": "customers", "on": "2026-09-30"},
            "Reading aged balances for customers on Sep 30, 2026",
        ),
        ("list_journal_entries", {}, "Listing journal entries"),
        (
            "list_journal_entries",
            {"account": "owners_equity", "from": "2026-01-01"},
            "Listing journal entries in Owner's equity dated from Jan 1, 2026",
        ),
        (
            "list_journal_entries",
            {"to": "2026-03-31", "text": "INV"},
            'Listing journal entries dated up to Mar 31, 2026 matching "INV"',
        ),
    ],
)
def test_each_look_up_says_what_it_does_as_it_starts(name, arguments, words):
    assert running(name, **arguments) == words


def test_an_aged_view_is_customers_or_suppliers_and_has_to_be_chosen():
    assert isinstance(tools.check("get_aged_balances", {}), tools.Refused)
    assert isinstance(tools.check("get_aged_balances", {"view": "everyone"}), tools.Refused)
