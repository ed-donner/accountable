"""The chart of accounts (J1, J2): fixed, kept here and not in the database.

Nothing else in the backend names an account's key, and the sign rule for a balance lives here.
"""

from dataclasses import dataclass

ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE = "asset", "liability", "equity", "revenue", "expense"

CASH, RECEIVABLE, PAYABLE, TAX_PAYABLE = "cash", "receivable", "payable", "tax_payable"
OWNERS_EQUITY, REVENUE_ACCOUNT = "owners_equity", "revenue"


@dataclass(frozen=True)
class Account:
    key: str
    name: str
    type: str

    @property
    def debit_normal(self) -> bool:
        """Assets and expenses are on their usual side with debits."""
        return self.type in (ASSET, EXPENSE)


# In the order the spec gives them. The expense accounts follow the bill categories (E6).
CHART = (
    Account(CASH, "Cash", ASSET),
    Account(RECEIVABLE, "Receivable", ASSET),
    Account(PAYABLE, "Payable", LIABILITY),
    Account(TAX_PAYABLE, "Tax payable", LIABILITY),
    Account(OWNERS_EQUITY, "Owner's equity", EQUITY),
    Account(REVENUE_ACCOUNT, "Revenue", REVENUE),
    Account("expense_software", "Software", EXPENSE),
    Account("expense_contractors", "Contractors", EXPENSE),
    Account("expense_travel", "Travel", EXPENSE),
    Account("expense_office", "Office", EXPENSE),
    Account("expense_marketing", "Marketing", EXPENSE),
    Account("expense_other", "Other", EXPENSE),
)
KEYS = tuple(account.key for account in CHART)
BY_KEY = {account.key: account for account in CHART}


def expense_for(category: str) -> str:
    """The expense account for a bill's category key."""
    return f"expense_{category}"


def balance(key: str, debits: int, credits: int) -> int:
    """Above zero when the account is on its usual side."""
    return debits - credits if BY_KEY[key].debit_normal else credits - debits


EXPENSE_ACCOUNTS = tuple(account.key for account in CHART if account.type == EXPENSE)
"""The six expense accounts, in the chart's order, which is the bill categories' order (E6)."""


def category_of(key: str) -> str:
    """The bill category key for an expense account's key, such as "software" for "expense_software"."""
    return key.removeprefix("expense_")
