"""What the Copilot can look up (Z8, Z9): each look-up reads one or more of the routes the
app's own pages read, all GETs, and narrows and cuts the reply before the model sees it.

A list look-up gives its rows through tools.rows, at most 50 with how many matched. A record
or a report gives the route's reply, with each list in it that grows with the records given as
rows too. Every step's words come from the arguments, and once read, from the records (Z5).
"""

from collections.abc import Callable, Coroutine, Iterable, Mapping, Sequence
from datetime import date
from typing import Annotated, Any, Literal, NamedTuple, get_args

from pydantic import Field, StringConstraints

from accountable.copilot.calls import Caller, Route
from accountable.copilot.tools import (
    MOST_ROWS,
    STAGE_NAMES,
    Arguments,
    Done,
    NoArguments,
    RecordId,
    Refused,
    Stage,
    Tool,
    day,
    days,
    rows,
)

# Search


class SearchArguments(Arguments):
    text: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
        Field(description="Part of a name, such as acme"),
    ]


async def _search(caller: Caller, arguments: SearchArguments) -> Done | Refused:
    reply = await caller.get("/api/search", {"q": arguments.text})
    if not reply.ok:
        return Refused.from_reply(reply)
    found: list[dict[str, Any]] = []
    matched = 0
    for group, results in reply.data.items():
        # Each group is named for its kind, such as "deals", and keeps its own fields, such as a deal's stage.
        found += [{"kind": group.removesuffix("s"), **result} for result in results["results"]]
        matched += results["count"]
    return Done(data=rows(found, matched), words=f'Searched for "{arguments.text}"')


SEARCH = Tool(
    name="search",
    description=(
        "Find organizations, contacts, deals and active products by part of their name. "
        "Gives the first few of each kind with their ids, and how many matched."
    ),
    arguments=SearchArguments,
    kind="look-up",
    routes=(Route("GET", "/api/search"),),
    running=lambda arguments: f'Searching for "{arguments.text}"',
    run=_search,
)

# The routes Z8 names, as the app lists them

ORGANIZATIONS = "/api/organizations"
ORGANIZATION = "/api/organizations/{organization_id}"
CONTACTS = "/api/contacts"
CONTACT = "/api/contacts/{contact_id}"
DEALS = "/api/deals"
DEAL = "/api/deals/{deal_id}"
DASHBOARD = "/api/dashboard"
PRODUCTS = "/api/products"
QUOTES = "/api/quotes"
QUOTE = "/api/quotes/{quote_id}"
INVOICES = "/api/invoices"
INVOICE = "/api/invoices/{invoice_id}"
BILLS = "/api/bills"
BILL = "/api/bills/{bill_id}"
OWED_TO_US = "/api/invoices/money"
WE_OWE = "/api/bills/dashboard"
CASH_FLOW = "/api/cash-flow"
EXPECTED = "/api/cash-flow/expected"
PROFIT_AND_LOSS = "/api/books/profit-and-loss"
BALANCES = "/api/books/balances"
AGED_BALANCES = {"customers": "/api/aged-balances/customers", "suppliers": "/api/aged-balances/suppliers"}
ENTRIES = "/api/books/entries"
SETTINGS = "/api/settings"

# The app's own choices, which copilot/ can't import from the areas that own them. The tests check they agree.

OPEN_STAGES = ("new", "qualified", "proposal", "negotiation")
ContactStatus = Literal["lead", "qualified", "customer"]
QuoteStatus = Literal["draft", "sent", "expired", "accepted", "declined"]
"""As the Quotes table shows them (Q34): a sent quote past its valid-until date is expired, not sent."""
ShowsAs = Literal["draft", "issued", "part_paid", "overdue", "paid", "void"]
BillState = Literal["unpaid", "overdue", "paid"]
Category = Literal["software", "contractors", "travel", "office", "marketing", "other"]
CATEGORY_NAMES = {category: category.capitalize() for category in get_args(Category)}
Account = Literal[
    "cash",
    "receivable",
    "payable",
    "tax_payable",
    "owners_equity",
    "revenue",
    "expense_software",
    "expense_contractors",
    "expense_travel",
    "expense_office",
    "expense_marketing",
    "expense_other",
]
ACCOUNT_NAMES = {
    "cash": "Cash",
    "receivable": "Receivable",
    "payable": "Payable",
    "tax_payable": "Tax payable",
    "owners_equity": "Owner's equity",
    "revenue": "Revenue",
    **{f"expense_{category}": name for category, name in CATEGORY_NAMES.items()},
}
MONTH_NAMES = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)
"""In English whatever the computer's language, as profit and loss labels its months (X4)."""

Part = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
"""Part of a name or of other text, as a table's search takes it."""
Month = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]

# Shaping what the model is told


def _as_rows(data: Mapping[str, Any], *paths: str) -> dict[str, Any]:
    """The reply with the list at each dotted path, such as "follow_ups.items", given as rows,
    so no list in it hands the model more than 50 (Z9)."""
    shaped = dict(data)
    for path in paths:
        first, _, rest = path.partition(".")
        shaped[first] = _as_rows(shaped[first], rest) if rest else rows(shaped[first])
    return shaped


def _holds(text: str | None, part: str | None) -> bool:
    """Whether the text holds the part, ignoring case in any language, as the app's searches do (K2)."""
    return part is None or (text is not None and part.casefold() in text.casefold())


async def _read(caller: Caller, path: str, params: Mapping[str, Any] | None = None) -> Any:
    """The route's reply, or a refusal in the API's words."""
    reply = await caller.get(path, params)
    return reply.data if reply.ok else Refused.from_reply(reply)


def _iso(value: date | None) -> str | None:
    """A day as the API takes it, or None, which the caller leaves out."""
    return value.isoformat() if value else None


# Words for steps, written from the arguments and the records (Z5)

Rows = Sequence[Mapping[str, Any]]


class Noun(NamedTuple):
    one: str
    many: str


def _counted(count: int, noun: Noun) -> str:
    """Such as "no deals", "1 deal" or "4 deals"."""
    if count == 0:
        return f"no {noun.many}"
    return f"1 {noun.one}" if count == 1 else f"{count} {noun.many}"


def _either(names: Iterable[str]) -> str:
    """Such as "Proposal", "Proposal or Negotiation" or "New, Qualified or Proposal"."""
    *rest, last = dict.fromkeys(names)
    return f"{', '.join(rest)} or {last}" if rest else last


def _between(verb: str, first: date | None, last: date | None) -> str | None:
    if first and last:
        return f"{verb} {days(first, last)}"
    if first:
        return f"{verb} from {day(first)}"
    return f"{verb} up to {day(last)}" if last else None


def _named(found: Rows, word: str, record_id: int, *path: str) -> str:
    """The record a list was narrowed to, by the name its rows give it, or by its id while none has been read."""
    value: Any = found[0] if found else None
    for key in path:
        value = value.get(key) if isinstance(value, Mapping) else None
    return value if isinstance(value, str) else f"{word} {record_id}"


def _month(key: str) -> str:
    """A month given as YYYY-MM, such as November 2026."""
    year, month = key.split("-")
    return f"{MONTH_NAMES[int(month) - 1]} {year}"


# A list look-up

Describe = Callable[[Any, Rows], tuple[Noun, list[str]]]
"""What a list holds and how it was narrowed, from the arguments and the rows found, such as
(Noun("deal", "deals"), ["closing Nov 1 to Nov 30, 2026"])."""
Find = Callable[[Caller, Any], Coroutine[Any, Any, list[dict[str, Any]] | Refused]]


def _given(*qualifiers: str | None) -> list[str]:
    return [qualifier for qualifier in qualifiers if qualifier]


def _list_look_up[A: Arguments](
    *, name: str, description: str, arguments: type[A], routes: tuple[Route, ...], find: Find, describe: Describe
) -> Tool[A]:
    """A look-up that lists records, narrowed on the route's reply, as rows (Z9)."""

    async def run(caller: Caller, given: A) -> Done | Refused:
        found = await find(caller, given)
        if isinstance(found, Refused):
            return found
        noun, qualifiers = describe(given, found)
        return Done(data=rows(found), words=" ".join(["Found", _counted(len(found), noun), *qualifiers]))

    def running(given: A) -> str:
        noun, qualifiers = describe(given, [])
        return " ".join(["Listing", noun.many, *qualifiers])

    return Tool(
        name=name,
        description=description,
        arguments=arguments,
        kind="look-up",
        routes=routes,
        running=running,
        run=run,
    )


# Organizations, contacts and deals


class OrganizationsArguments(Arguments):
    name_contains: Part | None = Field(None, description="Part of the name")
    industry: Part | None = Field(None, description="Part of the industry, such as hospitality")


async def _find_organizations(caller: Caller, arguments: OrganizationsArguments) -> list[dict[str, Any]] | Refused:
    listed = await _read(caller, ORGANIZATIONS)
    if isinstance(listed, Refused):
        return listed
    return [
        organization
        for organization in listed
        if _holds(organization["name"], arguments.name_contains)
        and _holds(organization["industry"], arguments.industry)
    ]


def _describe_organizations(arguments: OrganizationsArguments, _found: Rows) -> tuple[Noun, list[str]]:
    return Noun("organization", "organizations"), _given(
        arguments.name_contains and f'matching "{arguments.name_contains}"',
        arguments.industry and f'with industry "{arguments.industry}"',
    )


LIST_ORGANIZATIONS = _list_look_up(
    name="list_organizations",
    description="List organizations by name, with their contact count, open deals and last activity.",
    arguments=OrganizationsArguments,
    routes=(Route("GET", ORGANIZATIONS),),
    find=_find_organizations,
    describe=_describe_organizations,
)


class ContactsArguments(Arguments):
    name_contains: Part | None = Field(None, description="Part of the name")
    organization_id: RecordId | None = None
    status: ContactStatus | None = None


STATUS_NOUNS: dict[str | None, Noun] = {
    None: Noun("contact", "contacts"),
    "lead": Noun("lead", "leads"),
    "qualified": Noun("qualified contact", "qualified contacts"),
    "customer": Noun("customer", "customers"),
}


async def _find_contacts(caller: Caller, arguments: ContactsArguments) -> list[dict[str, Any]] | Refused:
    listed = await _read(caller, CONTACTS)
    if isinstance(listed, Refused):
        return listed
    return [
        contact
        for contact in listed
        if _holds(contact["name"], arguments.name_contains)
        and arguments.organization_id in (None, contact["organization_id"])
        and arguments.status in (None, contact["status"])
    ]


def _describe_contacts(arguments: ContactsArguments, found: Rows) -> tuple[Noun, list[str]]:
    organization = arguments.organization_id
    return STATUS_NOUNS[arguments.status], _given(
        arguments.name_contains and f'matching "{arguments.name_contains}"',
        f"at {_named(found, 'organization', organization, 'organization_name')}" if organization else None,
    )


LIST_CONTACTS = _list_look_up(
    name="list_contacts",
    description="List contacts by name, with their organization, status and last activity.",
    arguments=ContactsArguments,
    routes=(Route("GET", CONTACTS),),
    find=_find_contacts,
    describe=_describe_contacts,
)


class DealsArguments(Arguments):
    name_contains: Part | None = Field(None, description="Part of the name")
    stages: list[Stage] | None = Field(None, min_length=1, description="Keep deals in these stages")
    organization_id: RecordId | None = None
    main_contact_id: RecordId | None = None
    closing_from: date | None = Field(None, description="Keep deals closing on or after this day, YYYY-MM-DD")
    closing_to: date | None = Field(None, description="Keep deals closing on or before this day, YYYY-MM-DD")
    late_only: bool = Field(False, description="Keep late deals only: open, with a close date before today")


def _deal_fits(deal: Mapping[str, Any], arguments: DealsArguments, today: date) -> bool:
    closes = date.fromisoformat(deal["close_date"])
    late = deal["stage"] in OPEN_STAGES and closes < today
    return (
        _holds(deal["name"], arguments.name_contains)
        and (arguments.stages is None or deal["stage"] in arguments.stages)
        and arguments.organization_id in (None, deal["organization_id"])
        and arguments.main_contact_id in (None, deal["main_contact_id"])
        and (arguments.closing_from is None or closes >= arguments.closing_from)
        and (arguments.closing_to is None or closes <= arguments.closing_to)
        and (late or not arguments.late_only)
    )


async def _find_deals(caller: Caller, arguments: DealsArguments) -> list[dict[str, Any]] | Refused:
    listed = await _read(caller, DEALS)
    if isinstance(listed, Refused):
        return listed
    found = [deal for deal in listed if _deal_fits(deal, arguments, caller.today)]
    # Earliest close first, as the Deals table sorts, so the 50 kept are the next to close.
    return sorted(found, key=lambda deal: (deal["close_date"], deal["id"]))


def _describe_deals(arguments: DealsArguments, found: Rows) -> tuple[Noun, list[str]]:
    organization, contact = arguments.organization_id, arguments.main_contact_id
    noun = Noun("late deal", "late deals") if arguments.late_only else Noun("deal", "deals")
    return noun, _given(
        arguments.name_contains and f'matching "{arguments.name_contains}"',
        f"in {_either(STAGE_NAMES[stage] for stage in arguments.stages)}" if arguments.stages else None,
        f"for {_named(found, 'organization', organization, 'organization_name')}" if organization else None,
        f"with {_named(found, 'contact', contact, 'main_contact_name')}" if contact else None,
        _between("closing", arguments.closing_from, arguments.closing_to),
    )


LIST_DEALS = _list_look_up(
    name="list_deals",
    description=(
        "List deals, earliest close first, narrowed by name, stage, organization, main contact, close dates "
        "or late deals only. Each has its stage, value and expected revenue in whole dollars, and probability."
    ),
    arguments=DealsArguments,
    routes=(Route("GET", DEALS),),
    find=_find_deals,
    describe=_describe_deals,
)


# One record in full


class RecordArguments(Arguments):
    id: RecordId = Field(description="The record's id, from a list or a search")


def _record_look_up(
    *,
    name: str,
    description: str,
    word: str,
    template: str,
    page: str,
    title: Callable[[Mapping[str, Any]], str],
    shaped: Callable[[Mapping[str, Any], date], Any] = lambda record, _today: record,
) -> Tool[RecordArguments]:
    """A look-up that reads one record through its page's route, and names it once read (Z5)."""

    async def run(caller: Caller, arguments: RecordArguments) -> Done | Refused:
        record = await _read(caller, Caller.path(template, arguments.id))
        if isinstance(record, Refused):
            return record
        return Done(data=shaped(record, caller.today), words=f"Read {title(record)}", link=f"{page}/{arguments.id}")

    return Tool(
        name=name,
        description=description,
        arguments=RecordArguments,
        kind="look-up",
        routes=(Route("GET", template),),
        running=lambda arguments: f"Reading {word} {arguments.id}",
        run=run,
    )


def _name(record: Mapping[str, Any]) -> str:
    return record["name"]


GET_ORGANIZATION = _record_look_up(
    name="get_organization",
    description="Read one organization in full, with its notes, contacts and deals.",
    word="organization",
    template=ORGANIZATION,
    page="/organizations",
    title=_name,
    shaped=lambda record, _today: _as_rows(record, "contacts", "deals"),
)
GET_CONTACT = _record_look_up(
    name="get_contact",
    description="Read one contact in full, with the deals where they're the main contact.",
    word="contact",
    template=CONTACT,
    page="/contacts",
    title=_name,
    shaped=lambda record, _today: _as_rows(record, "deals"),
)
GET_DEAL = _record_look_up(
    name="get_deal",
    description="Read one deal in full: its stage, value, probability, close date, organization and main contact.",
    word="deal",
    template=DEAL,
    page="/deals",
    title=_name,
)


# Timelines


class TimelineArguments(Arguments):
    kind: Literal["organization", "contact", "deal"]
    id: RecordId = Field(description="The organization's, contact's or deal's id")


class Timeline(NamedTuple):
    record: str
    timeline: str
    page: str


TIMELINES = {
    "organization": Timeline(ORGANIZATION, f"{ORGANIZATION}/timeline", "/organizations"),
    "contact": Timeline(CONTACT, f"{CONTACT}/timeline", "/contacts"),
    "deal": Timeline(DEAL, f"{DEAL}/timeline", "/deals"),
}


async def _timeline(caller: Caller, arguments: TimelineArguments) -> Done | Refused:
    """The record first, for its name, then its newest 50 entries, with how many there are in all."""
    routes = TIMELINES[arguments.kind]
    record = await _read(caller, Caller.path(routes.record, arguments.id))
    if isinstance(record, Refused):
        return record
    timeline = await _read(caller, Caller.path(routes.timeline, arguments.id), {"limit": MOST_ROWS})
    if isinstance(timeline, Refused):
        return timeline
    return Done(
        data=rows(timeline["entries"], timeline["total"]),
        words=f"Read the timeline of {record['name']}",
        link=f"{routes.page}/{arguments.id}",
    )


GET_TIMELINE = Tool(
    name="get_timeline",
    description=(
        "Read an organization's, contact's or deal's timeline, newest first: "
        "activities, follow-ups and stage changes, with who added each."
    ),
    arguments=TimelineArguments,
    kind="look-up",
    routes=tuple(Route("GET", path) for routes in TIMELINES.values() for path in (routes.record, routes.timeline)),
    running=lambda arguments: f"Reading the timeline of {arguments.kind} {arguments.id}",
    run=_timeline,
)


# Reading one thing that takes nothing


def _reading(
    *, name: str, description: str, path: str, words: str, shaped: Callable[[Any], Any] = lambda reply: reply
) -> Tool[NoArguments]:
    """A look-up that's asked nothing, reads one route and tells the model its reply."""

    async def run(caller: Caller, _arguments: NoArguments) -> Done | Refused:
        reply = await _read(caller, path)
        return reply if isinstance(reply, Refused) else Done(data=shaped(reply), words=f"Read {words}")

    return Tool(
        name=name,
        description=description,
        arguments=NoArguments,
        kind="look-up",
        routes=(Route("GET", path),),
        running=lambda _arguments: f"Reading {words}",
        run=run,
    )


GET_DASHBOARD = _reading(
    name="get_dashboard",
    description=(
        "Read the dashboard: revenue and deals won this month and last, the open pipeline, expected revenue, "
        "late deals, the last 12 months, the follow-ups not yet done and the recent activity."
    ),
    path=DASHBOARD,
    words="the dashboard",
    shaped=lambda reply: _as_rows(reply, "follow_ups.items"),
)
GET_COMPANY_SETTINGS = _reading(
    name="get_company_settings",
    description=(
        "Read the company settings: its name and details, tax, payment terms, number prefixes and opening balance."
    ),
    path=SETTINGS,
    words="the company settings",
)


async def _money(caller: Caller, _arguments: NoArguments) -> Done | Refused:
    owed_to_us = await _read(caller, OWED_TO_US)
    if isinstance(owed_to_us, Refused):
        return owed_to_us
    we_owe = await _read(caller, WE_OWE)
    if isinstance(we_owe, Refused):
        return we_owe
    return Done(
        data={"owed_to_us": owed_to_us, "we_owe": _as_rows(we_owe, "due.bills")},
        words="Read what customers owe us and what we owe",
    )


GET_MONEY = Tool(
    name="get_money",
    description=(
        "Read what customers owe us, how late, and the payments each month, beside what we owe suppliers, "
        "what's overdue, the bills due in the next 30 days and spending by category. Amounts are in cents."
    ),
    arguments=NoArguments,
    kind="look-up",
    routes=(Route("GET", OWED_TO_US), Route("GET", WE_OWE)),
    running=lambda _arguments: "Reading what customers owe us and what we owe",
    run=_money,
)


# Products


class ProductsArguments(Arguments):
    name_contains: Part | None = Field(None, description="Part of the name")
    include_archived: bool = Field(False, description="Include products taken off the price list")


async def _find_products(caller: Caller, arguments: ProductsArguments) -> list[dict[str, Any]] | Refused:
    listed = await _read(caller, PRODUCTS)
    if isinstance(listed, Refused):
        return listed
    return [
        product
        for product in listed
        if (product["active"] or arguments.include_archived) and _holds(product["name"], arguments.name_contains)
    ]


def _describe_products(arguments: ProductsArguments, _found: Rows) -> tuple[Noun, list[str]]:
    return Noun("product", "products"), _given(
        arguments.name_contains and f'matching "{arguments.name_contains}"',
        "including archived ones" if arguments.include_archived else None,
    )


LIST_PRODUCTS = _list_look_up(
    name="list_products",
    description="List the price list by name, each with its unit price in cents and description.",
    arguments=ProductsArguments,
    routes=(Route("GET", PRODUCTS),),
    find=_find_products,
    describe=_describe_products,
)


# Quotes


def _with_quote_status(quote: Mapping[str, Any], today: date) -> dict[str, Any]:
    """The quote with how it shows, worked out from today as the app does (Q7)."""
    expired = quote["status"] == "sent" and date.fromisoformat(quote["valid_until"]) < today
    return {**quote, "shows_as": "expired" if expired else quote["status"]}


class QuotesArguments(Arguments):
    status: QuoteStatus | None = None
    deal_id: RecordId | None = None
    organization_id: RecordId | None = Field(None, description="Keep the quotes on this organization's deals")


async def _find_quotes(caller: Caller, arguments: QuotesArguments) -> list[dict[str, Any]] | Refused:
    # The route narrows to a deal or an organization itself, as it does for their pages' panels.
    params = {"deal_id": arguments.deal_id, "organization_id": arguments.organization_id}
    listed = await _read(caller, QUOTES, params)
    if isinstance(listed, Refused):
        return listed
    shown = [_with_quote_status(quote, caller.today) for quote in listed]
    return [quote for quote in shown if arguments.status in (None, quote["shows_as"])]


def _describe_quotes(arguments: QuotesArguments, found: Rows) -> tuple[Noun, list[str]]:
    deal, organization = arguments.deal_id, arguments.organization_id
    status = f"{arguments.status} " if arguments.status else ""
    return Noun(f"{status}quote", f"{status}quotes"), _given(
        f"on {_named(found, 'deal', deal, 'deal_name')}" if deal else None,
        f"for {_named(found, 'organization', organization, 'organization_name')}" if organization else None,
    )


LIST_QUOTES = _list_look_up(
    name="list_quotes",
    description=(
        "List quotes, newest first, narrowed by status, deal or organization. "
        "Each has its number, deal, dates and value, tax and total in cents."
    ),
    arguments=QuotesArguments,
    routes=(Route("GET", QUOTES),),
    find=_find_quotes,
    describe=_describe_quotes,
)
GET_QUOTE = _record_look_up(
    name="get_quote",
    description="Read one quote in full, with its lines, totals in cents, Prepared for and dates.",
    word="quote",
    template=QUOTE,
    page="/quotes",
    title=lambda quote: quote["number"],
    shaped=lambda quote, today: _as_rows(_with_quote_status(quote, today), "lines"),
)


# Invoices


class InvoicesArguments(Arguments):
    shows_as: ShowsAs | None = Field(None, description="What the invoice shows as")
    deal_id: RecordId | None = None
    organization_id: RecordId | None = Field(
        None, description="Keep the invoices issued to this organization, and the drafts on its deals"
    )


async def _find_invoices(caller: Caller, arguments: InvoicesArguments) -> list[dict[str, Any]] | Refused:
    # The route narrows to a deal or an organization itself, as it does for their pages' panels (V21).
    params = {"deal_id": arguments.deal_id, "organization_id": arguments.organization_id}
    listed = await _read(caller, INVOICES, params)
    if isinstance(listed, Refused):
        return listed
    return [invoice for invoice in listed if arguments.shows_as in (None, invoice["shows_as"])]


def _describe_invoices(arguments: InvoicesArguments, found: Rows) -> tuple[Noun, list[str]]:
    deal, organization = arguments.deal_id, arguments.organization_id
    shown = f"{arguments.shows_as.replace('_', ' ')} " if arguments.shows_as else ""
    return Noun(f"{shown}invoice", f"{shown}invoices"), _given(
        f"on {_named(found, 'deal', deal, 'deal', 'name')}" if deal else None,
        f"for {_named(found, 'organization', organization, 'organization', 'name')}" if organization else None,
    )


def _invoice_title(invoice: Mapping[str, Any]) -> str:
    return invoice["number"] or f"the draft invoice on {invoice['deal']['name']}"


LIST_INVOICES = _list_look_up(
    name="list_invoices",
    description=(
        "List invoices, newest first, narrowed by what they show as, deal or organization. "
        "Each has its number, dates, and total and what's owed in cents."
    ),
    arguments=InvoicesArguments,
    routes=(Route("GET", INVOICES),),
    find=_find_invoices,
    describe=_describe_invoices,
)
GET_INVOICE = _record_look_up(
    name="get_invoice",
    description="Read one invoice in full, with its lines, totals, payments and days late. Amounts are in cents.",
    word="invoice",
    template=INVOICE,
    page="/invoices",
    title=_invoice_title,
    shaped=lambda invoice, _today: _as_rows(invoice, "lines", "payments"),
)


# Bills


class BillsArguments(Arguments):
    state: BillState | None = Field(None, description="Unpaid includes the overdue bills")
    organization_id: RecordId | None = Field(None, description="The supplier's id")
    category: Category | None = None


def _bill_fits(bill: Mapping[str, Any], arguments: BillsArguments, today: date) -> bool:
    paid = bill["paid_on"] is not None
    overdue = not paid and date.fromisoformat(bill["due_date"]) < today
    states = {"unpaid": not paid, "overdue": overdue, "paid": paid}
    return (arguments.state is None or states[arguments.state]) and arguments.category in (None, bill["category"])


async def _find_bills(caller: Caller, arguments: BillsArguments) -> list[dict[str, Any]] | Refused:
    # The route narrows to one supplier itself, as it does for an organization's Bills panel.
    listed = await _read(caller, BILLS, {"organization_id": arguments.organization_id})
    if isinstance(listed, Refused):
        return listed
    return [bill for bill in listed if _bill_fits(bill, arguments, caller.today)]


def _describe_bills(arguments: BillsArguments, found: Rows) -> tuple[Noun, list[str]]:
    supplier = arguments.organization_id
    state = f"{arguments.state} " if arguments.state else ""
    return Noun(f"{state}bill", f"{state}bills"), _given(
        f"from {_named(found, 'organization', supplier, 'organization', 'name')}" if supplier else None,
        f"in {CATEGORY_NAMES[arguments.category]}" if arguments.category else None,
    )


LIST_BILLS = _list_look_up(
    name="list_bills",
    description=(
        "List bills from suppliers, earliest due first, narrowed by unpaid, overdue or paid, supplier or category. "
        "Each has its bill number, dates, and amount, tax and total in cents."
    ),
    arguments=BillsArguments,
    routes=(Route("GET", BILLS),),
    find=_find_bills,
    describe=_describe_bills,
)
GET_BILL = _record_look_up(
    name="get_bill",
    description="Read one bill in full, with its supplier, dates, amounts in cents, category and notes.",
    word="bill",
    template=BILL,
    page="/bills",
    title=lambda bill: f"bill {bill['bill_number']} from {bill['organization']['name']}",
)


# The cash flow


class CashFlowArguments(Arguments):
    month: Month | None = Field(
        None, description="This month or one of the next three, as YYYY-MM, for what's expected in it"
    )


async def _cash_flow(caller: Caller, arguments: CashFlowArguments) -> Done | Refused:
    if arguments.month is None:
        months = await _read(caller, CASH_FLOW)
        return months if isinstance(months, Refused) else Done(data=months, words="Read the cash flow")
    expected = await _read(caller, EXPECTED, {"month": arguments.month})
    if isinstance(expected, Refused):
        return expected
    return Done(
        data=_as_rows(expected, "coming_in.items", "going_out.items", "likely_deals.items"),
        words=f"Read what's expected in {_month(arguments.month)}",
    )


GET_CASH_FLOW = Tool(
    name="get_cash_flow",
    description=(
        "Read the cash flow: money in and out for each of the last 12 months, the cash balance at each month's "
        "end and the forecast for the next 3, in cents. Given a month, what's expected in it instead."
    ),
    arguments=CashFlowArguments,
    kind="look-up",
    routes=(Route("GET", CASH_FLOW), Route("GET", EXPECTED)),
    running=lambda arguments: (
        f"Reading what's expected in {_month(arguments.month)}" if arguments.month else "Reading the cash flow"
    ),
    run=_cash_flow,
)


# The three reports


class ProfitAndLossArguments(Arguments):
    period: Literal["month", "quarter", "year"] = "month"
    on: date | None = Field(None, description="A day in the period, as YYYY-MM-DD. Today without it")


def _period(arguments: ProfitAndLossArguments) -> str:
    """The period as profit and loss labels it, such as October 2026, Q4 2026 or 2026 (X4)."""
    on = arguments.on
    if on is None:
        return f"this {arguments.period}"
    if arguments.period == "month":
        return f"{MONTH_NAMES[on.month - 1]} {on.year}"
    return f"Q{(on.month - 1) // 3 + 1} {on.year}" if arguments.period == "quarter" else str(on.year)


async def _profit_and_loss(caller: Caller, arguments: ProfitAndLossArguments) -> Done | Refused:
    params = {"period": arguments.period, "on": _iso(arguments.on)}
    report = await _read(caller, PROFIT_AND_LOSS, params)
    if isinstance(report, Refused):
        return report
    return Done(data=report, words=f"Read profit and loss for {report['period']['label']}")


GET_PROFIT_AND_LOSS = Tool(
    name="get_profit_and_loss",
    description=(
        "Read profit and loss for a month, quarter or year: revenue, expenses by category, profit and margin, "
        "with the change from the period before, and the last 12 months. Amounts are in cents."
    ),
    arguments=ProfitAndLossArguments,
    kind="look-up",
    routes=(Route("GET", PROFIT_AND_LOSS),),
    running=lambda arguments: f"Reading profit and loss for {_period(arguments)}",
    run=_profit_and_loss,
)


class OnArguments(Arguments):
    on: date | None = Field(None, description="The day, as YYYY-MM-DD. Today without it")


def _on(on: date | None) -> str:
    return f"on {day(on)}" if on else "for today"


async def _balance_sheet(caller: Caller, arguments: OnArguments) -> Done | Refused:
    sheet = await _read(caller, BALANCES, {"on": _iso(arguments.on)})
    if isinstance(sheet, Refused):
        return sheet
    return Done(data=sheet, words=f"Read the balance sheet on {day(sheet['on'])}")


GET_BALANCE_SHEET = Tool(
    name="get_balance_sheet",
    description=(
        "Read every account's balance on a day, in cents: what the business owns, what it owes and the owner's "
        "equity. Profit to date is revenue less the expense accounts."
    ),
    arguments=OnArguments,
    kind="look-up",
    routes=(Route("GET", BALANCES),),
    running=lambda arguments: f"Reading the balance sheet {_on(arguments.on)}",
    run=_balance_sheet,
)


class AgedBalancesArguments(Arguments):
    view: Literal["customers", "suppliers"] = Field(description="What customers owe us, or what we owe suppliers")
    on: date | None = Field(None, description="The day, as YYYY-MM-DD, today or earlier. Today without it")


async def _aged_balances(caller: Caller, arguments: AgedBalancesArguments) -> Done | Refused:
    params = {"on": _iso(arguments.on)}
    report = await _read(caller, AGED_BALANCES[arguments.view], params)
    if isinstance(report, Refused):
        return report
    return Done(data=_as_rows(report, "rows"), words=f"Read aged balances for {arguments.view} on {day(report['on'])}")


GET_AGED_BALANCES = Tool(
    name="get_aged_balances",
    description=(
        "Read who owes the business money, or whom it owes, on a day, for each organization, "
        "by days past due, with each open invoice or bill. Amounts are in cents."
    ),
    arguments=AgedBalancesArguments,
    kind="look-up",
    routes=tuple(Route("GET", path) for path in AGED_BALANCES.values()),
    running=lambda arguments: f"Reading aged balances for {arguments.view} {_on(arguments.on)}",
    run=_aged_balances,
)


# The journal


class JournalArguments(Arguments):
    account: Account | None = Field(None, description="Keep entries with a line in this account")
    from_day: date | None = Field(None, alias="from", description="The first day, as YYYY-MM-DD")
    to: date | None = Field(None, description="The last day, as YYYY-MM-DD")
    text: Part | None = Field(None, description="Part of the description or document number")


def _describe_journal(arguments: JournalArguments) -> list[str]:
    return _given(
        arguments.account and f"in {ACCOUNT_NAMES[arguments.account]}",
        _between("dated", arguments.from_day, arguments.to),
        arguments.text and f'matching "{arguments.text}"',
    )


JOURNAL_ENTRY = Noun("journal entry", "journal entries")


async def _journal(caller: Caller, arguments: JournalArguments) -> Done | Refused:
    params = {
        "account": arguments.account,
        "from": _iso(arguments.from_day),
        "to": _iso(arguments.to),
        "q": arguments.text,
        "limit": MOST_ROWS,
    }
    page = await _read(caller, ENTRIES, params)
    if isinstance(page, Refused):
        return page
    words = " ".join(["Found", _counted(page["total"], JOURNAL_ENTRY), *_describe_journal(arguments)])
    return Done(data=rows(page["entries"], page["total"]), words=words)


LIST_JOURNAL_ENTRIES = Tool(
    name="list_journal_entries",
    description=(
        "List the books' journal entries, newest first, narrowed by account, dates or text, "
        "each with its lines' debits and credits in cents."
    ),
    arguments=JournalArguments,
    kind="look-up",
    routes=(Route("GET", ENTRIES),),
    running=lambda arguments: " ".join(["Listing", JOURNAL_ENTRY.many, *_describe_journal(arguments)]),
    run=_journal,
)

LOOKUPS: list[Tool[Any]] = [
    SEARCH,
    LIST_ORGANIZATIONS,
    LIST_CONTACTS,
    LIST_DEALS,
    GET_ORGANIZATION,
    GET_CONTACT,
    GET_DEAL,
    GET_TIMELINE,
    GET_DASHBOARD,
    GET_MONEY,
    GET_COMPANY_SETTINGS,
    LIST_PRODUCTS,
    LIST_QUOTES,
    GET_QUOTE,
    LIST_INVOICES,
    GET_INVOICE,
    LIST_BILLS,
    GET_BILL,
    GET_CASH_FLOW,
    GET_PROFIT_AND_LOSS,
    GET_BALANCE_SHEET,
    GET_AGED_BALANCES,
    LIST_JOURNAL_ENTRIES,
]
