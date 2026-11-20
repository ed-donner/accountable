"""The fixed sample content (DATA-2 to DATA-9): a made-up B2B agency selling
websites, branding, marketing retainers, analytics and training.

Every date is an offset from the seed day, so "late", "this month" and "next
month" always look right. Emails and websites use the reserved .example domain.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Org:
    key: str
    name: str
    industry: str
    domain: str
    notes: str | None = None


@dataclass(frozen=True)
class Person:
    key: str
    name: str
    org: str | None
    status: str
    job_title: str | None
    phone: str | None = None


@dataclass(frozen=True)
class DaysFromToday:
    days: int


@dataclass(frozen=True)
class MonthsAgo:
    """A number of months ago, on a day of the month. The day is held to the
    month's length, and the date is kept outside the board's 30-day window."""

    months: int
    day: int


@dataclass(frozen=True)
class Deal:
    key: str
    name: str
    org: str
    contact: str | None
    value: int
    path: tuple[str, ...]
    close: DaysFromToday | MonthsAgo
    # Days from created_at to the deal's end: its close date, or today if that's earlier.
    age: int
    # When each stage change happened, in days before the end (0 is the end itself).
    steps: tuple[int, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class Logged:
    """A note, call or email. `when` is (days from today, "HH:MM" local) or
    ("close", days from the deal's close date, "HH:MM")."""

    on: str  # "deal:<key>" or "contact:<key>"
    type: str
    description: str
    when: tuple
    follow_up: int | None = None  # days from today
    done: bool = False


ORGANIZATIONS = [
    Org(
        "bluefin",
        "Bluefin Logistics",
        "Logistics",
        "bluefin.example",
        "Regional freight and warehousing, with three depots.",
    ),
    Org("cedar", "Cedar Health Partners", "Healthcare", "cedarhealth.example", "A group of six family clinics."),
    Org(
        "harbor",
        "Harbor & Pine Outfitters",
        "Retail",
        "harborpine.example",
        "Outdoor clothing. A flagship store and a busy online shop.",
    ),
    Org(
        "ferro",
        "Ferro Fabrication",
        "Manufacturing",
        "ferrofab.example",
        "Metal fabrication for the construction trade.",
    ),
    Org(
        "oakridge",
        "Oakridge Credit Union",
        "Financial services",
        "oakridgecu.example",
        "About 40,000 members across the county.",
    ),
    Org("lumen", "Lumen Analytics", "Software", "lumenanalytics.example", "Analytics software for retailers."),
    Org("tidewater", "Tidewater Food Bank", "Nonprofit", "tidewaterfood.example", "Board approves budgets quarterly."),
    Org(
        "quillfield",
        "Quillfield Robotics",
        "Robotics",
        "quillfield.example",
        "Warehouse robots. Series B raised this year.",
    ),
    Org("brightpath", "Brightpath Academy", "Education", "brightpath.example", "Independent school, ages 4 to 18."),
    Org("saltmarsh", "Saltmarsh Hotels", "Hospitality", "saltmarsh.example", "Four coastal hotels with event spaces."),
    Org("northwind", "Northwind Dental Group", "Healthcare", "northwinddental.example"),
    Org("copperline", "Copperline Energy", "Energy", "copperline.example", "Community solar provider."),
    Org("meridian", "Meridian Law Partners", "Legal", "meridianlaw.example"),
    Org(
        "juniper",
        "Juniper Street Bakery",
        "Food and drink",
        "juniperbakery.example",
        "Two bakeries and a wholesale line.",
    ),
    Org("atlas", "Atlas Property Group", "Real estate", "atlasproperty.example", "Commercial lettings and management."),
]

PEOPLE = [
    Person("sarah", "Sarah Chen", "bluefin", "customer", "Head of Operations", "+1 555 0142"),
    Person("marcus_bell", "Marcus Bell", "bluefin", "qualified", "IT Director", "+1 555 0143"),
    Person("tom", "Tom Reyes", "bluefin", "lead", "Procurement Manager"),
    Person("amir", "Amir Haddad", "cedar", "customer", "Marketing Director", "+1 555 0177"),
    Person("nina", "Nina Patel", "cedar", "lead", "Practice Manager"),
    Person("jonah", "Jonah Park", "harbor", "customer", "Ecommerce Lead", "+1 555 0110"),
    Person("lila", "Lila Moreno", "harbor", "qualified", "Brand Manager"),
    Person("owen", "Owen Fisher", "harbor", "lead", "Store Operations"),
    Person("grace", "Grace Liu", "ferro", "qualified", "Marketing Manager", "+1 555 0191"),
    Person("dmitri", "Dmitri Volkov", "ferro", "lead", "Plant Manager"),
    Person("dana", "Dana Whitfield", "oakridge", "customer", "HR Director", "+1 555 0128"),
    Person("paul", "Paul Okafor", "oakridge", "lead", "Member Services Lead"),
    Person("helen", "Helen Brooks", "oakridge", "customer", "Chief Executive"),
    Person("priya", "Priya Nair", "lumen", "customer", "VP Marketing", "+1 555 0163"),
    Person("ben", "Ben Carter", "lumen", "qualified", "Product Manager"),
    Person("aisha", "Aisha Rahman", "lumen", "qualified", "Data Lead"),
    Person("rosa", "Rosa Delgado", "tidewater", "customer", "Development Director", "+1 555 0155"),
    Person("sam", "Sam Whitaker", "tidewater", "lead", "Volunteer Coordinator"),
    Person("theo", "Theo Grant", "quillfield", "qualified", "Head of Communications", "+1 555 0186"),
    Person("hana", "Hana Sato", "quillfield", "lead", "Chief Technology Officer"),
    Person("marcus_webb", "Marcus Webb", "brightpath", "customer", "Principal", "+1 555 0104"),
    Person("ivy", "Ivy Chen", "brightpath", "lead", "Admissions Lead"),
    Person("elena", "Elena Rossi", "saltmarsh", "qualified", "Marketing Lead", "+1 555 0139"),
    Person("callum", "Callum Reid", "saltmarsh", "customer", "General Manager"),
    Person("diego", "Diego Alvarez", "saltmarsh", "lead", "Events Manager"),
    Person("fatima", "Fatima Khan", "northwind", "lead", "Operations Manager"),
    Person("george", "George Hale", "northwind", "qualified", "Practice Owner", "+1 555 0120"),
    Person("ruth", "Ruth Adeyemi", "copperline", "customer", "Communications Director", "+1 555 0168"),
    Person("victor", "Victor Lang", "copperline", "lead", "Field Services Manager"),
    Person("clara", "Clara Beaumont", "meridian", "qualified", "Managing Partner"),
    Person("isaac", "Isaac Wu", "meridian", "lead", "Office Manager"),
    Person("maya", "Maya Russo", "juniper", "customer", "Owner", "+1 555 0181"),
    Person("leo", "Leo Brandt", "juniper", "lead", "Wholesale Manager"),
    Person("nora", "Nora Quinn", "atlas", "qualified", "Marketing Lead"),
    Person("felix", "Felix Ortega", "atlas", "customer", "Director", "+1 555 0172"),
    Person("zoe", "Zoe Martin", "atlas", "lead", "Leasing Agent"),
    # Four leads with no organization yet.
    Person("jordan", "Jordan Ellis", None, "lead", "Freelance consultant"),
    Person("mei", "Mei Tanaka", None, "lead", None),
    Person("kwame", "Kwame Mensah", None, "lead", "Founder"),
    Person("sofia", "Sofia Lindqvist", None, "lead", "Event planner"),
]

N, Q, P, G, W, L = "new", "qualified", "proposal", "negotiation", "won", "lost"

# Positions on the board follow the order here, within each stage.
DEALS = [
    # Open: New
    Deal("paid_social", "Paid social pilot", "harbor", "jonah", 15000, (N,), DaysFromToday(21), -25),
    Deal("brand_workshop", "Brand workshop series", "brightpath", "marcus_webb", 12000, (N,), DaysFromToday(29), -30),
    Deal("sustainability_report", "Sustainability report design", "ferro", None, 9500, (N,), DaysFromToday(50), -22),
    Deal("analytics_retainer", "Annual analytics retainer", "lumen", "priya", 36000, (N,), DaysFromToday(57), -14),
    Deal("loyalty_app", "Loyalty app discovery", "saltmarsh", "elena", 28000, (N,), DaysFromToday(78), -12),
    # Open: Qualified
    Deal("trade_show", "Trade show campaign", "ferro", "grace", 24000, (N, Q), DaysFromToday(-7), -40, (-28,)),
    Deal("seo_retainer", "SEO retainer 2027", "cedar", "amir", 42000, (N, Q), DaysFromToday(33), -35, (-20,)),
    Deal("data_dashboard", "Data dashboard build", "bluefin", "sarah", 38000, (N, Q), DaysFromToday(62), -45, (-15,)),
    Deal("member_portal", "Member portal redesign", "oakridge", "dana", 84000, (N, Q), DaysFromToday(71), -50, (-10,)),
    Deal(
        "course_catalog",
        "Course catalog site",
        "brightpath",
        "marcus_webb",
        55000,
        (N, Q),
        DaysFromToday(85),
        -30,
        (-6,),
    ),
    # Open: Proposal
    Deal(
        "spring_catalog",
        "Spring catalog shoot",
        "harbor",
        "jonah",
        31000,
        (N, Q, P),
        DaysFromToday(-3),
        -60,
        (-45, -25),
    ),
    Deal("patient_intake", "Patient intake forms", "cedar", "amir", 67000, (N, P), DaysFromToday(15), -30, (-6,)),
    Deal(
        "website_redesign", "Website redesign", "bluefin", "sarah", 48500, (N, Q, P), DaysFromToday(23), -55, (-30, 0)
    ),
    Deal("grant_campaign", "Grant campaign", "tidewater", "rosa", 18000, (N, P), DaysFromToday(41), -40, (-12,)),
    Deal(
        "booking_engine",
        "Booking engine integration",
        "saltmarsh",
        "elena",
        112000,
        (N, Q, P),
        DaysFromToday(56),
        -50,
        (-35, -14),
    ),
    # Open: Negotiation
    Deal(
        "staff_training",
        "Staff training program",
        "oakridge",
        "dana",
        22000,
        (N, Q, P, G),
        DaysFromToday(-13),
        -80,
        (-60, -35, -15),
    ),
    Deal(
        "marketing_retainer",
        "Marketing retainer 2027",
        "lumen",
        "priya",
        96000,
        (N, P, G),
        DaysFromToday(12),
        -45,
        (-20, -5),
    ),
    Deal(
        "rebrand",
        "Rebrand and identity",
        "quillfield",
        "theo",
        145000,
        (N, Q, P, G),
        DaysFromToday(26),
        -70,
        (-50, -25, -11),
    ),
    Deal("ecommerce", "E-commerce replatform", "harbor", "jonah", 128000, (N, P, G), DaysFromToday(31), -60, (-30, -1)),
    # Won
    Deal(
        "q4_content", "Q4 content retainer", "cedar", "amir", 54000, (N, P, G, W), DaysFromToday(0), -60, (-40, -15, 0)
    ),
    Deal("logo_refresh", "Logo refresh", "tidewater", "rosa", 8500, (N, P, W), DaysFromToday(-25), -50, (-20, 0)),
    Deal(
        "clinic_website",
        "Clinic website launch",
        "northwind",
        "george",
        42000,
        (N, Q, P, W),
        MonthsAgo(2, 14),
        -70,
        (-55, -30, 0),
    ),
    Deal(
        "leasing_site",
        "Leasing site rebuild",
        "atlas",
        "felix",
        96000,
        (N, Q, P, G, W),
        MonthsAgo(3, 22),
        -90,
        (-75, -50, -20, 0),
    ),
    Deal("bakery_brand", "Bakery brand refresh", "juniper", "maya", 12000, (N, P, W), MonthsAgo(4, 9), -40, (-25, 0)),
    Deal(
        "freight_portal",
        "Freight tracking portal",
        "bluefin",
        "sarah",
        31000,
        (N, P, W),
        MonthsAgo(6, 3),
        -60,
        (-30, 0),
    ),
    Deal(
        "member_onboarding",
        "Member onboarding emails",
        "oakridge",
        "helen",
        24000,
        (N, Q, P, W),
        MonthsAgo(6, 27),
        -50,
        (-35, -15, 0),
    ),
    Deal(
        "analytics_v1",
        "Analytics dashboard v1",
        "lumen",
        "priya",
        65000,
        (N, P, G, W),
        MonthsAgo(7, 12),
        -65,
        (-40, -14, 0),
    ),
    Deal("holiday_lookbook", "Holiday lookbook", "harbor", "jonah", 19000, (N, P, W), MonthsAgo(9, 18), -35, (-20, 0)),
    Deal(
        "investor_site",
        "Annual report and investor site",
        "copperline",
        "ruth",
        140000,
        (N, Q, P, G, W),
        MonthsAgo(11, 8),
        -80,
        (-65, -40, -18, 0),
    ),
    # Lost
    Deal("podcast", "Podcast production", "quillfield", "hana", 22000, (N, Q, L), DaysFromToday(-6), -45, (-30, 0)),
    Deal("event_microsite", "Event microsite", "meridian", "clara", 9000, (N, L), DaysFromToday(-18), -40, (0,)),
    Deal(
        "fleet_livery",
        "Fleet livery design",
        "bluefin",
        "marcus_bell",
        15000,
        (N, P, L),
        MonthsAgo(2, 3),
        -50,
        (-28, 0),
    ),
    Deal(
        "gala_video",
        "Fundraising gala video",
        "tidewater",
        "rosa",
        7500,
        (N, Q, P, L),
        MonthsAgo(5, 20),
        -60,
        (-45, -20, 0),
    ),
    Deal(
        "practice_rebrand",
        "Practice rebrand",
        "northwind",
        "george",
        35000,
        (N, P, G, L),
        MonthsAgo(8, 11),
        -70,
        (-45, -15, 0),
    ),
    Deal("energy_app", "Energy tips app", "copperline", "victor", 60000, (N, Q, L), MonthsAgo(10, 25), -55, (-35, 0)),
]

LOGGED = [
    # Open follow-ups: 3 overdue, 4 due in the next 7 days, 3 later.
    Logged("deal:staff_training", "call", "Chase the signed scope for staff training.", (-9, "10:20"), follow_up=-6),
    Logged(
        "deal:spring_catalog",
        "email",
        "Sent the revised catalog shoot quote. Jonah wants to check it with finance.",
        (-5, "14:10"),
        follow_up=-2,
    ),
    Logged(
        "contact:grace",
        "call",
        "Talked through the trade show brief. Grace will share last year's booth photos.",
        (-4, "11:30"),
        follow_up=-1,
    ),
    Logged(
        "deal:rebrand",
        "note",
        "Prepare pricing options for the rebrand: identity only, and identity plus site.",
        (-2, "16:05"),
        follow_up=0,
    ),
    Logged(
        "deal:website_redesign",
        "call",
        "Walk Sarah through the proposal before her board meeting.",
        (-6, "09:40"),
        follow_up=1,
    ),
    Logged(
        "contact:priya", "email", "Priya asked for two case studies from software clients.", (-3, "13:15"), follow_up=4
    ),
    Logged(
        "contact:elena", "call", "Intro call booked with Saltmarsh's new marketing lead.", (-1, "10:05"), follow_up=6
    ),
    Logged(
        "deal:marketing_retainer",
        "note",
        "Book the kickoff workshop once the retainer is signed.",
        (-8, "15:30"),
        follow_up=12,
    ),
    Logged("deal:seo_retainer", "email", "Promised the Q1 SEO roadmap by early December.", (-7, "12:00"), follow_up=20),
    Logged(
        "deal:member_portal",
        "note",
        "Plan the member portal discovery sessions with Dana's team.",
        (-12, "11:00"),
        follow_up=35,
    ),
    # Follow-ups already done.
    Logged(
        "deal:q4_content",
        "email",
        "Sent the signed retainer contract back to Amir.",
        (-4, "17:20"),
        follow_up=-2,
        done=True,
    ),
    Logged(
        "deal:logo_refresh",
        "call",
        "Checked Rosa received the final logo files.",
        (-27, "10:00"),
        follow_up=-20,
        done=True,
    ),
    Logged(
        "deal:event_microsite", "email", "Chased the event microsite quote.", (-24, "09:30"), follow_up=-21, done=True
    ),
    Logged("contact:ben", "email", "Sent Ben our intro deck and day rates.", (-14, "14:45"), follow_up=-10, done=True),
    Logged(
        "contact:george",
        "call",
        "Checked the clinic website launch went smoothly. George is happy.",
        (-50, "11:15"),
        follow_up=-40,
        done=True,
    ),
    Logged(
        "contact:maya", "email", "Sent the brand guidelines PDF to Maya.", (-110, "10:30"), follow_up=-100, done=True
    ),
    # Recent work on open deals.
    Logged(
        "deal:website_redesign",
        "call",
        "Walked through the scope. Sarah wants phase two priced separately.",
        (0, "09:15"),
    ),
    Logged("deal:marketing_retainer", "email", "Sent the 2027 retainer terms for review.", (-1, "16:30")),
    Logged("deal:rebrand", "note", "Theo prefers a February launch for the new identity.", (-2, "11:20")),
    Logged("deal:grant_campaign", "call", "Rosa confirmed the board approved the campaign budget.", (-3, "15:40")),
    Logged("deal:paid_social", "call", "Jonah wants to test paid social on two product lines first.", (-10, "11:00")),
    Logged("deal:paid_social", "email", "Sent a one-page pilot outline with a $15,000 budget.", (-8, "16:20")),
    Logged(
        "deal:brand_workshop",
        "note",
        "Three workshops for staff and governors, spread over the spring term.",
        (-15, "10:45"),
    ),
    Logged(
        "deal:sustainability_report",
        "note",
        "Ferro needs the report designed before their March audit. No main contact yet.",
        (-20, "14:00"),
    ),
    Logged(
        "deal:analytics_retainer",
        "call",
        "Priya is comparing us with an in-house hire. Keep the retainer flexible.",
        (-11, "15:10"),
    ),
    Logged("deal:loyalty_app", "email", "Shared discovery questions for the loyalty app.", (-9, "09:50")),
    Logged("deal:trade_show", "email", "Sent booth concepts. Waiting on Grace for a decision.", (-16, "13:30")),
    Logged("deal:trade_show", "call", "Grace says the budget sign-off slipped a week.", (-10, "10:10")),
    Logged("deal:seo_retainer", "call", "Amir wants monthly reporting on clinic page rankings.", (-18, "11:40")),
    Logged(
        "deal:data_dashboard",
        "note",
        "Bluefin's data sits in three spreadsheets and a transport system export.",
        (-22, "15:00"),
    ),
    Logged("deal:data_dashboard", "call", "Sarah's team will send sample exports next week.", (-13, "10:30")),
    Logged("deal:member_portal", "email", "Dana shared the current portal's top support complaints.", (-19, "12:20")),
    Logged("deal:course_catalog", "note", "The course catalog needs filters by age group and subject.", (-17, "14:35")),
    Logged(
        "deal:spring_catalog", "call", "Agreed a two-day shoot in the Harbor & Pine flagship store.", (-21, "11:10")
    ),
    Logged("deal:patient_intake", "email", "Sent the proposal for digital patient intake forms.", (-6, "16:45")),
    Logged("deal:patient_intake", "call", "Amir's team asked about accessibility for older patients.", (-2, "10:25")),
    Logged("deal:website_redesign", "email", "Sent the proposal with three design directions.", (-9, "15:55")),
    Logged("deal:grant_campaign", "email", "Shared the campaign timeline for the spring grant round.", (-12, "13:05")),
    Logged(
        "deal:booking_engine", "call", "Elena needs the booking engine live before the summer season.", (-14, "09:35")
    ),
    Logged(
        "deal:booking_engine",
        "note",
        "Integration needs an API key from their property system vendor.\nElena has asked them for it.",
        (-7, "17:10"),
    ),
    Logged("deal:staff_training", "email", "Sent the training outline for front-line staff.", (-20, "14:15")),
    Logged(
        "deal:marketing_retainer",
        "call",
        "Priya is happy with the scope. Their legal team is reviewing the terms.",
        (-5, "11:55"),
    ),
    Logged("deal:rebrand", "call", "Walked Theo through the identity moodboards.", (-11, "15:25")),
    Logged("deal:ecommerce", "email", "Sent the replatforming estimate with a phased plan.", (-10, "12:40")),
    Logged(
        "deal:ecommerce", "call", "Jonah wants the new store live before next year's holiday season.", (-4, "09:55")
    ),
    # Closed deals.
    Logged("deal:q4_content", "call", "Amir confirmed they'll sign the Q4 retainer today.", (0, "08:50")),
    Logged("deal:logo_refresh", "email", "Sent the final logo concepts to Rosa.", (-32, "11:30")),
    Logged("deal:clinic_website", "note", "The clinic site went live with online booking.", ("close", 0, "16:00")),
    Logged("deal:clinic_website", "call", "George approved the final page designs.", ("close", -12, "10:15")),
    Logged("deal:leasing_site", "call", "Felix signed off the leasing site rebuild.", ("close", 0, "14:20")),
    Logged("deal:leasing_site", "email", "Sent the negotiation summary and revised timeline.", ("close", -9, "11:00")),
    Logged("deal:bakery_brand", "note", "New packaging approved for all three bakery lines.", ("close", 0, "12:30")),
    Logged(
        "deal:freight_portal",
        "email",
        "Sent the signed statement of work for the freight tracking portal.",
        ("close", 0, "15:45"),
    ),
    Logged("deal:member_onboarding", "call", "Helen approved the onboarding email series.", ("close", -1, "13:40")),
    Logged("deal:analytics_v1", "note", "Handed over dashboard v1 with a training session.", ("close", 2, "10:00")),
    Logged(
        "deal:holiday_lookbook",
        "call",
        "Jonah loved the lookbook shots and signed for the holiday run.",
        ("close", 0, "11:25"),
    ),
    Logged(
        "deal:investor_site",
        "email",
        "Ruth sent the signed contract for the annual report and investor site.",
        ("close", 0, "09:10"),
    ),
    Logged("deal:podcast", "call", "Hana decided to produce the podcast in-house.", (-6, "14:50")),
    Logged(
        "deal:event_microsite", "note", "Meridian went with their existing web agency for the event.", (-18, "10:40")
    ),
    Logged("deal:fleet_livery", "email", "Bluefin postponed the fleet livery to next year.", ("close", 0, "16:15")),
    Logged("deal:gala_video", "call", "Rosa said the gala video budget was cut.", ("close", 0, "12:05")),
    Logged("deal:practice_rebrand", "note", "Lost the practice rebrand on price.", ("close", 0, "17:30")),
    Logged("deal:energy_app", "email", "Copperline paused the energy tips app.", ("close", 0, "11:50")),
    # Contacts.
    Logged("contact:tom", "call", "Tom handles procurement and wants to be copied on all quotes.", (-30, "10:00")),
    Logged("contact:nina", "email", "Nina asked about website care plans for the clinics.", (-25, "14:30")),
    Logged("contact:owen", "note", "Met Owen at the retail meetup. Interested in in-store signage.", (-40, "18:00")),
    Logged("contact:dmitri", "call", "Dmitri may need a careers page to hire for the new plant.", (-35, "09:20")),
    Logged("contact:paul", "email", "Paul asked for examples of member newsletters.", (-28, "13:00")),
    Logged("contact:aisha", "call", "Aisha wants help presenting data to non-technical teams.", (-21, "16:10")),
    Logged("contact:sam", "note", "Sam coordinates volunteers. Possible volunteer sign-up site.", (-45, "11:45")),
    Logged("contact:ivy", "email", "Ivy asked about refreshing the admissions brochure.", (-33, "10:50")),
    Logged("contact:diego", "call", "Diego runs weddings and events and wants a better enquiry form.", (-19, "15:35")),
    Logged("contact:fatima", "email", "Fatima got in touch through the website contact form.", (-8, "12:15")),
    Logged("contact:victor", "note", "Victor's team still wants the field app, just not this year.", (-60, "14:05")),
    Logged("contact:isaac", "call", "Isaac is managing the office move and needs new signage.", (-26, "10:35")),
    Logged("contact:leo", "note", "Leo is opening a second bakery in the spring.", (-38, "16:40")),
    Logged("contact:nora", "email", "Nora asked for a proposal for new listings photography.", (-5, "11:05")),
    Logged("contact:zoe", "call", "Zoe wants a simpler way to send leasing brochures.", (-23, "13:55")),
    Logged("contact:jordan", "note", "Jordan refers clients to us. Send a thank-you note at year end.", (-50, "17:00")),
    Logged("contact:kwame", "call", "Kwame is founding a fintech startup and will need a brand.", (-15, "10:15")),
]
