/**
 * Issue #6: prevent duplicate prospective students. The build is standard Duplicate Management (DES-02): the
 * Lead duplicate rule Prospective_Student_Lead_Duplicate compares a new Lead with Leads (same Email, or same
 * First Name, Last Name and Mobile) and with Contacts (same Email), and on create allows the save with an alert.
 * Apex and API inserts get the alert as a DUPLICATES_DETECTED error unless they set allowSave (AC4, plan
 * decision 1). Inserts here run as the Recruitment Officer in user mode with the duplicate rule run as that user
 * (TST-16, TST-17, APX-21), and cover positive, negative, bulk and denial paths (TST-03, SHR-15). Matching
 * values are synthetic and unique per test (@example.invalid, fictional mobiles; TST-04, TST-06).
 */
@IsTest
private class LeadDuplicateRuleTest {
    private static final String DUPLICATE_RULE = 'Prospective_Student_Lead_Duplicate';
    private static final String LEAD_MATCHING_RULE = 'Prospective_Student_Lead_Match';
    // The plan's alert text. Plain language, and the Playwright tests look for it to tell this rule's alert
    // apart from any other active Lead duplicate rule in the org.
    private static final String ALERT_TEXT = 'This person may already be in the system. Check the matching records before you contact them.';
    // Australian mobiles reserved for fiction (ACMA), so they can never match a real person.
    private static final String EXISTING_MOBILE = '0491 570 156';
    private static final String OTHER_MOBILE = '0491 570 157';
    private static final String NEW_MOBILE = '0491 570 158';
    // Field tokens for the access test (APX-57).
    private static final List<Schema.SObjectField> OFFICER_EDITS = new List<Schema.SObjectField>{ Lead.Email, Lead.MobilePhone };
    private static final List<Schema.SObjectField> OFFICER_READS = new List<Schema.SObjectField>{ Contact.Email };

    @TestSetup
    static void setup() {
        TestPersonaFactory.createAll(TestPersonas.all());
        String token = uniqueToken();
        Lead existing = TestDataFactory.buildLeads(1, 'Existing')[0];
        existing.FirstName = 'Mai';
        existing.Email = 'existing-lead-' + token + '@example.invalid';
        existing.MobilePhone = EXISTING_MOBILE;
        Contact student = TestDataFactory.buildContacts(1, 'ExistingContact')[0];
        student.FirstName = 'Tuan';
        student.Email = 'existing-contact-' + token + '@example.invalid';
        // System mode on purpose (APX-22): reference data, people already in the system before the officer's
        // enquiry. The Contact is not the officer's to create (the persona has no Contact create).
        Database.insert(existing, AccessLevel.SYSTEM_MODE);
        Database.insert(student, AccessLevel.SYSTEM_MODE);
    }

    // AC1: same email as an existing Lead or Contact shows a duplicate alert listing the match.

    @IsTest
    static void shouldFlagNewLeadWithSameEmailAsExistingLead() {
        Lead existing = existingLead();
        Lead enquiry = TestDataFactory.buildLeads(1, 'SameEmail')[0];
        enquiry.Email = existing.Email;
        Database.SaveResult result;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            result = insertLeads(new List<Lead>{ enquiry }, false)[0];
            Test.stopTest();
        }
        Datacloud.DuplicateResult duplicate = ruleResult(result);
        Assert.isNotNull(duplicate, 'The Prospective Student rule flags the Lead: ' + result.getErrors());
        Assert.areEqual(StatusCode.DUPLICATES_DETECTED, duplicateError(result).getStatusCode(), 'Reported as DUPLICATES_DETECTED');
        Assert.areEqual(ALERT_TEXT, duplicate.getErrorMessage(), 'The alert is the plan\'s plain-language text');
        Assert.isTrue(duplicate.isAllowSave(), 'The rule alerts and allows the save, it does not block');
        Assert.areEqual(new Set<Id>{ existing.Id }, matchedIds(duplicate, Lead.SObjectType), 'The alert lists the existing Lead');
        Assert.areEqual(LEAD_MATCHING_RULE, matchResult(duplicate, Lead.SObjectType).getRule(), 'Matched by the Lead matching rule');
    }

    @IsTest
    static void shouldFlagNewLeadWithSameEmailAsExistingContact() {
        Contact student = existingContact();
        Lead enquiry = TestDataFactory.buildLeads(1, 'SameContactEmail')[0];
        enquiry.Email = student.Email;
        Database.SaveResult result;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            result = insertLeads(new List<Lead>{ enquiry }, false)[0];
            Test.stopTest();
        }
        Datacloud.DuplicateResult duplicate = ruleResult(result);
        Assert.isNotNull(duplicate, 'The Prospective Student rule flags the Lead: ' + result.getErrors());
        Assert.areEqual(ALERT_TEXT, duplicate.getErrorMessage(), 'The alert is the plan\'s plain-language text');
        // The Contact is owned by the setup user. Contact OWD is Public Read/Write here, so the officer can read it
        // and it is listed. Bypass sharing rules (plan decision 2) only reports a match; it grants no access to
        // records the officer can't see (.agent/6/diagnostics/person-accounts-and-sharing.md).
        Assert.areEqual(new Set<Id>{ student.Id }, matchedIds(duplicate, Contact.SObjectType), 'The alert lists the existing Contact');
        Assert.isTrue(matchedIds(duplicate, Lead.SObjectType).isEmpty(), 'No Lead shares this email');
    }

    // AC2: same first name, last name and mobile as an existing Lead shows the alert.

    @IsTest
    static void shouldFlagNewLeadWithSameNameAndMobileAsExistingLead() {
        Lead existing = existingLead();
        Lead enquiry = sameNameAs(existing, EXISTING_MOBILE);
        enquiry.Email = 'other-' + uniqueToken() + '@example.invalid';
        Database.SaveResult result;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            result = insertLeads(new List<Lead>{ enquiry }, false)[0];
            Test.stopTest();
        }
        Datacloud.DuplicateResult duplicate = ruleResult(result);
        Assert.isNotNull(duplicate, 'Same name and mobile is flagged although the email differs: ' + result.getErrors());
        Assert.areEqual(new Set<Id>{ existing.Id }, matchedIds(duplicate, Lead.SObjectType), 'The alert lists the existing Lead');
        Assert.areEqual(LEAD_MATCHING_RULE, matchResult(duplicate, Lead.SObjectType).getRule(), 'Matched by the Lead matching rule');
    }

    @IsTest
    static void shouldNotFlagSameNameWithDifferentMobile() {
        Lead enquiry = sameNameAs(existingLead(), OTHER_MOBILE);
        enquiry.Email = 'other-' + uniqueToken() + '@example.invalid';
        Database.SaveResult result;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            result = insertLeads(new List<Lead>{ enquiry }, false)[0];
            Test.stopTest();
        }
        // Only this story's rule is asserted: another active Lead rule in the org may match on name alone.
        Assert.isNull(ruleResult(result), 'Same name with a different mobile and email is not this rule\'s duplicate');
    }

    // AC3: a Lead with a different email and mobile saves without an alert.

    @IsTest
    static void shouldSaveLeadWithDifferentEmailAndMobileWithoutAlert() {
        Lead enquiry = TestDataFactory.buildLeads(1, 'Distinct')[0];
        enquiry.FirstName = 'Linh';
        enquiry.Email = 'distinct-' + uniqueToken() + '@example.invalid';
        enquiry.MobilePhone = NEW_MOBILE;
        Database.SaveResult result;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            result = insertLeads(new List<Lead>{ enquiry }, false)[0];
            Test.stopTest();
        }
        Assert.isTrue(result.isSuccess(), 'A distinct enquiry saves with no alert: ' + result.getErrors());
        Assert.areEqual(1, [SELECT COUNT() FROM Lead WHERE Id = :result.getId() WITH SYSTEM_MODE], 'The Lead is saved');
    }

    @IsTest
    static void shouldNotMatchLeadsWithBlankEmailAndMobile() {
        Lead earlier = TestDataFactory.buildLeads(1, 'Blank')[0];
        earlier.FirstName = 'Anh';
        // System mode on purpose (APX-22): setup data, an older enquiry captured without email or mobile.
        Database.insert(earlier, AccessLevel.SYSTEM_MODE);
        Lead enquiry = TestDataFactory.buildLeads(1, 'Blank')[0];
        enquiry.FirstName = 'Anh';
        Database.SaveResult result;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            result = insertLeads(new List<Lead>{ enquiry }, false)[0];
            Test.stopTest();
        }
        // Blank fields don't match (plan item 1), so seeded Leads that repeat names and have no email or mobile
        // don't start matching each other.
        Assert.isNull(ruleResult(result), 'Same name with blank email and mobile is not this rule\'s duplicate');
    }

    // Bulk (TST-03): 200 distinct enquiries save cleanly, and 200 repeats of their emails are each flagged.

    @IsTest
    static void shouldSave200DistinctLeadsAndFlag200Duplicates() {
        String token = uniqueToken();
        List<Lead> originals = TestDataFactory.buildLeads(200, 'BulkOriginal');
        List<Lead> repeats = TestDataFactory.buildLeads(200, 'BulkRepeat');
        for (Integer i = 0; i < 200; i++) {
            originals[i].Email = 'bulk-' + i + '-' + token + '@example.invalid';
            repeats[i].Email = originals[i].Email;
        }
        List<Database.SaveResult> first;
        List<Database.SaveResult> second;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            first = insertLeads(originals, false);
            Test.startTest();
            second = insertLeads(repeats, false);
            Test.stopTest();
        }
        for (Integer i = 0; i < 200; i++) {
            Assert.isTrue(first[i].isSuccess(), 'Distinct enquiry ' + i + ' saves: ' + first[i].getErrors());
        }
        for (Integer i = 0; i < 200; i++) {
            Datacloud.DuplicateResult duplicate = ruleResult(second[i]);
            Assert.isNotNull(duplicate, 'Repeat ' + i + ' is flagged: ' + second[i].getErrors());
            Assert.areEqual(new Set<Id>{ first[i].getId() }, matchedIds(duplicate, Lead.SObjectType), 'Repeat ' + i + ' lists its original');
        }
        Assert.areEqual(0, [SELECT COUNT() FROM Lead WHERE LastName LIKE 'BulkRepeat-%' WITH SYSTEM_MODE], 'No repeat saved without allowSave');
    }

    // AC4: the rule also applies to Leads created through the API. Apex DML takes the same save path as an API
    // insert: without allowSave the duplicate is refused, with allowSave it saves (plan decision 1).

    @IsTest
    static void shouldRejectApiStyleInsertUnlessAllowSaveIsSet() {
        Lead existing = existingLead();
        Lead refused = TestDataFactory.buildLeads(1, 'ApiRefused')[0];
        refused.Email = existing.Email;
        Lead allowed = TestDataFactory.buildLeads(1, 'ApiAllowed')[0];
        allowed.Email = existing.Email;
        Database.SaveResult refusedResult;
        Database.SaveResult allowedResult;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            refusedResult = insertLeads(new List<Lead>{ refused }, false)[0];
            allowedResult = insertLeads(new List<Lead>{ allowed }, true)[0];
            Test.stopTest();
        }
        Assert.isFalse(refusedResult.isSuccess(), 'Without allowSave the duplicate is not saved');
        Assert.isNotNull(ruleResult(refusedResult), 'It is refused by the Prospective Student rule: ' + refusedResult.getErrors());
        Assert.areEqual(StatusCode.DUPLICATES_DETECTED, duplicateError(refusedResult).getStatusCode(), 'Reported as DUPLICATES_DETECTED');
        Assert.isTrue(allowedResult.isSuccess(), 'With allowSave the duplicate saves: ' + allowedResult.getErrors());
        Assert.areEqual(
            2,
            [SELECT COUNT() FROM Lead WHERE Email = :existing.Email WITH SYSTEM_MODE],
            'Only the existing Lead and the allowSave duplicate hold this email'
        );
    }

    // On edit the rule allows the save with no alert (plan item 3), so updates and Lead conversion (#8) of a
    // saved duplicate are not refused.

    @IsTest
    static void shouldAllowEditOfSavedDuplicateWithoutAlert() {
        Lead duplicate = TestDataFactory.buildLeads(1, 'SavedDuplicate')[0];
        duplicate.Email = existingLead().Email;
        Database.SaveResult updated;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Database.SaveResult inserted = insertLeads(new List<Lead>{ duplicate }, true)[0];
            Assert.isTrue(inserted.isSuccess(), 'Setup: the duplicate is saved with allowSave: ' + inserted.getErrors());
            Lead edit = new Lead(Id = inserted.getId(), MobilePhone = NEW_MOBILE);
            Test.startTest();
            updated = Database.update(new List<Lead>{ edit }, ruleHeader(false), AccessLevel.USER_MODE)[0];
            Test.stopTest();
        }
        Assert.isTrue(updated.isSuccess(), 'Editing a saved duplicate raises no alert: ' + updated.getErrors());
    }

    // Denial (TST-03, SHR-15): a persona without Lead access cannot create the Lead and gets no duplicate result.

    @IsTest
    static void shouldRefuseLeadCreateToMinimumAccessPersona() {
        Lead enquiry = TestDataFactory.buildLeads(1, 'Deny')[0];
        enquiry.Email = existingLead().Email;
        Database.SaveResult result;
        System.runAs(TestPersonaFactory.get(TestPersonas.MINIMUM_ACCESS)) {
            // With partial success (optAllOrNone = false), user mode reports the missing object permission in the
            // save result rather than throwing (confirmed in the sandbox, .agent/6/diagnostics/denial-save-result.md).
            result = insertLeads(new List<Lead>{ enquiry }, false)[0];
        }
        Assert.isFalse(result.isSuccess(), 'A persona with no Lead access must not create Leads');
        Assert.areEqual(1, result.getErrors().size(), 'Refused with one error only: ' + result.getErrors());
        Database.Error error = result.getErrors()[0];
        Assert.areEqual(StatusCode.CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY, error.getStatusCode(), 'Refused for missing access: ' + error);
        Assert.isTrue(error.getMessage().contains('Access to entity \'Lead\' denied'), 'Refused for missing Lead access: ' + error.getMessage());
        Assert.isFalse(error instanceof Database.DuplicateError, 'No duplicate result, so no matching record, is returned to it');
        Assert.areEqual(0, [SELECT COUNT() FROM Lead WHERE LastName = 'Deny-0' WITH SYSTEM_MODE], 'No Lead was saved');
    }

    // Access (DES-05, 06 §6.1): the officer can enter email and mobile and read Contact email, through the
    // persona permission set and not the profile. Contact email is read only (least privilege).

    @IsTest
    static void shouldGrantEmailAndMobileThroughPermissionSetNotProfile() {
        Map<String, Schema.DescribeFieldResult> describes = new Map<String, Schema.DescribeFieldResult>();
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            // Field describes are evaluated for the current user, so read them inside runAs.
            for (Schema.SObjectField token : OFFICER_EDITS) {
                describes.put('Lead.' + token.getDescribe().getName(), token.getDescribe());
            }
            for (Schema.SObjectField token : OFFICER_READS) {
                describes.put('Contact.' + token.getDescribe().getName(), token.getDescribe());
            }
        }
        Assert.areEqual(3, describes.size(), 'Every field was described');
        for (String f : describes.keySet()) {
            Assert.isTrue(describes.get(f).isAccessible(), 'Persona can read ' + f);
        }
        Assert.isTrue(describes.get('Lead.Email').isCreateable() && describes.get('Lead.Email').isUpdateable(), 'Persona can enter Lead Email');
        Assert.isTrue(
            describes.get('Lead.MobilePhone').isCreateable() && describes.get('Lead.MobilePhone').isUpdateable(),
            'Persona can enter Lead Mobile'
        );

        Map<String, FieldPermissions> fromPermissionSet = new Map<String, FieldPermissions>();
        for (FieldPermissions fp : [
            SELECT Field, PermissionsRead, PermissionsEdit
            FROM FieldPermissions
            WHERE Field IN :describes.keySet() AND Parent.Name = 'Persona_Recruitment_Officer'
        ]) {
            fromPermissionSet.put(fp.Field, fp);
        }
        Assert.areEqual(describes.keySet(), fromPermissionSet.keySet(), 'Persona_Recruitment_Officer grants all three fields');
        Assert.isTrue(fromPermissionSet.get('Lead.Email').PermissionsEdit, 'Permission set grants Edit on Lead.Email');
        Assert.isTrue(fromPermissionSet.get('Lead.MobilePhone').PermissionsEdit, 'Permission set grants Edit on Lead.MobilePhone');
        Assert.isTrue(fromPermissionSet.get('Contact.Email').PermissionsRead, 'Permission set grants Read on Contact.Email');
        Assert.isFalse(fromPermissionSet.get('Contact.Email').PermissionsEdit, 'Contact.Email is read only (DES-05)');
        Assert.areEqual(
            0,
            [
                SELECT COUNT()
                FROM FieldPermissions
                WHERE Field IN :describes.keySet() AND Parent.IsOwnedByProfile = TRUE AND Parent.Profile.Name = 'Persona Base'
            ],
            'The Persona Base profile grants none of these fields (06 §6.1)'
        );
    }

    /** Inserts as the running user in user mode, partial success, with the duplicate rule run as that user. */
    private static List<Database.SaveResult> insertLeads(List<Lead> leads, Boolean allowSave) {
        return Database.insert(leads, ruleHeader(allowSave), AccessLevel.USER_MODE);
    }

    private static Database.DMLOptions ruleHeader(Boolean allowSave) {
        Database.DMLOptions options = new Database.DMLOptions();
        options.optAllOrNone = false;
        options.DuplicateRuleHeader.allowSave = allowSave;
        options.DuplicateRuleHeader.runAsCurrentUser = true;
        return options;
    }

    /** The duplicate error raised by this story's rule, or null. */
    private static Database.DuplicateError duplicateError(Database.SaveResult result) {
        for (Database.Error e : result.getErrors()) {
            if (e instanceof Database.DuplicateError && ((Database.DuplicateError) e).getDuplicateResult().getDuplicateRule() == DUPLICATE_RULE) {
                return (Database.DuplicateError) e;
            }
        }
        return null;
    }

    private static Datacloud.DuplicateResult ruleResult(Database.SaveResult result) {
        Database.DuplicateError e = duplicateError(result);
        return e == null ? null : e.getDuplicateResult();
    }

    private static Datacloud.MatchResult matchResult(Datacloud.DuplicateResult duplicate, Schema.SObjectType type) {
        for (Datacloud.MatchResult m : duplicate.getMatchResults()) {
            if (m.getEntityType() == String.valueOf(type)) {
                return m;
            }
        }
        return null;
    }

    private static Set<Id> matchedIds(Datacloud.DuplicateResult duplicate, Schema.SObjectType type) {
        Set<Id> ids = new Set<Id>();
        Datacloud.MatchResult m = matchResult(duplicate, type);
        if (m != null) {
            for (Datacloud.MatchRecord r : m.getMatchRecords()) {
                ids.add(r.getRecord().Id);
            }
        }
        return ids;
    }

    private static Lead sameNameAs(Lead existing, String mobile) {
        Lead l = TestDataFactory.buildLeads(1, 'SameName')[0];
        l.FirstName = existing.FirstName;
        l.LastName = existing.LastName;
        l.MobilePhone = mobile;
        return l;
    }

    private static Lead existingLead() {
        // System mode on purpose (APX-22): reads setup data; the test runner's FLS is not under test.
        return [SELECT Id, FirstName, LastName, Email, MobilePhone FROM Lead WHERE LastName = 'Existing-0' WITH SYSTEM_MODE];
    }

    private static Contact existingContact() {
        // System mode on purpose (APX-22): reads setup data.
        return [SELECT Id, Email FROM Contact WHERE LastName = 'ExistingContact-0' WITH SYSTEM_MODE];
    }

    private static String uniqueToken() {
        return EncodingUtil.convertToHex(Crypto.generateAesKey(128)).left(12);
    }
}
