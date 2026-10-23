# What inserts Leads in the sandbox (plan decision 1 condition), read-only, 2026-10-23

- Apex triggers on Lead: `npsp.TDTM_Lead` only (NPSP's trigger handler; it reacts to Lead DML and conversion, it does not insert Leads).
- Unmanaged Apex (184 classes, bodies searched for `new Lead`, `List<Lead>`, `ConvertLead`): only this repo's test classes
  (`TestDataFactory`, `LeadEnquiryDetailsTest`, `LeadSourceDetailAccessTest`, the list view tests). No integration or
  service class creates Leads.
- Active Flows: no record-triggered or custom Flow on Lead. Two Salesforce-provided template flows can create Leads when
  something invokes them: `sales_sfa_flows__CreateSalesLead` (Agentforce sales action) and
  `sfdc_fieldservice__CreateLeadAndOpp` (Field Service mobile). Neither is configured for use (no Leads exist).
- Installed packages: NPSP family, TAF, Nebula Logger, Lightning File Explorer, Experience Cloud components, Sales
  Insights, quickLookup, Power of Us Hub. None is a Lead-capture integration.
- Data: `SELECT COUNT() FROM Lead` = 0 and `SELECT COUNT() FROM Contact` = 0 (Developer sandbox holds no data), so nothing
  has created Leads here.
- Duplicate rules: three, all inactive (`NPSP_Contact_Personal_Email_Match`, `Standard_Rule_for_Leads_with_Duplicate_Contacts`,
  `Standard_Rule_for_Contacts_with_Duplicate_Leads`). Active matching rule on Contact: `NPSP_Contact_Personal_Email_Match`
  (FirstName fuzzy + LastName + an NPSP custom email field), not an exact `Email` rule, so DES-09 reuse doesn't apply.

Conclusion: nothing in the sandbox inserts Leads, so decision 1 stands and the build proceeds.

Added after review (arch-2): no Experience Cloud site's guest, customer or partner user can create Leads. Whether
Web-to-Lead is on can't be read through the API, so it must be confirmed before release
(`person-accounts-and-sharing.md`).
