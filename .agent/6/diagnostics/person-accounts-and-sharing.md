# Person Accounts, Contact sharing and Lead sources in the sandbox (review findings arch-1, sec-1, arch-2)

Read-only checks against sandbox `agent` (a copy of the real org), 2026-10-23. QA and production were not queried (PIPE-03).

## arch-1 (DM-12): are Person Accounts enabled?

No.

- `SELECT COUNT() FROM Account WHERE IsPersonAccount = true` fails with `INVALID_FIELD: No such column 'IsPersonAccount' on entity 'Account'`.
- `SELECT ... IsPersonType FROM RecordType` fails with `INVALID_FIELD: No such column 'IsPersonType'`. Both fields exist only when Person Accounts are on.
- Account record types: `HH_Account` (NPSP Household) and `Organization`, both active. There is no person account record type.

Students in this org are NPSP household Contacts, stored as `Contact` records. DM-12 allows "Person Account/Contact". The
Contact matching rule (`Prospective_Student_Contact_Match`, `Email` exact) therefore applies to every student Contact.
`LeadDuplicateRuleTest.shouldFlagNewLeadWithSameEmailAsExistingContact` and Playwright `#6 AC1 ... that Contact` prove it.
No person account exists to test against, so the plan's fallback (stop and ask a person if the rule doesn't flag a
person account) doesn't arise. `10-large-data-volumes.md` §2 calls Contact "all person-account contacts". That wording
doesn't match this org, so it's raised as an open question for the standards owner.

## sec-1 (SHR-15): Contact org-wide default

`EntityDefinition.InternalSharingModel`: Contact `ReadWrite`, Account `ReadWrite`, Lead `ReadWriteTransfer`. External: `Private` for all three.

Every internal user, including the Recruitment Officer, can read every Contact. So no Contact can be hidden from the
officer, and a persona test for "a Contact the officer cannot read" can't be built in this org. If Contact OWD
becomes Private, that test must be added, and plan decision 2 reviewed with it.

## arch-2 (QG-02): Web-to-Lead and Experience Cloud

- Experience Cloud: 7 Networks (2 Live: `Portal`, `Wad`), 14 Sites. No profile or permission set assigned to a Guest,
  customer or partner user grants Lead create (`PermissionSetAssignment` joined to `ObjectPermissions` with
  `SobjectType = 'Lead' AND PermissionsCreate = true`: 0 rows). So no site can create Leads.
- Web-to-Lead: the Metadata API doesn't expose whether it is on. `WebToXSettings` (retrieved to `retrieved-settings/`)
  holds only `webToLeadSpamFilter = false`. The sandbox holds 0 Leads, so nothing has submitted a web form here. Plan
  decision 1 (API and Apex callers that don't send `allowSave` get a `DUPLICATES_DETECTED` refusal) needs Web-to-Lead
  to be confirmed in production before release. This is in the handover's release note.
