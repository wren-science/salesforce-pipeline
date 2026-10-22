/**
 * Issue #4: Program catalogue (Program__c). The build is declarative (DES-02), so this class tests the
 * object, its constraints and the Recruitment Officer's access as that persona (TST-16, TST-17, 06 §7).
 * DML and SOQL under test run in user mode so CRUD/FLS is exercised (APX-21). Covers positive, negative,
 * bulk and denial paths (TST-03, SHR-15).
 */
@IsTest
private class ProgramCatalogueTest {
    @TestSetup
    static void setup() {
        TestPersonaFactory.createAll(TestPersonas.all());
        // Catalogue entry created by someone else: the persona edits it only if the OWD (ADR 0002) allows it.
        TestDataFactory.createPrograms(1, 'SETUP');
    }

    // AC1: a Program holds Name, Program Code, Study Level, Faculty and Active.

    @IsTest
    static void shouldLetRecruitmentOfficerCreateProgramWithAllFields() {
        Program__c p = new Program__c(
            Name = 'Master of Public Health',
            Program_Code__c = 'MPH-01',
            Study_Level__c = 'Postgraduate_Coursework',
            Faculty__c = 'Health',
            Active__c = true
        );
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            Database.insert(p, AccessLevel.USER_MODE);
            Test.stopTest();
            Program__c saved = [
                SELECT Name, Program_Code__c, Study_Level__c, Faculty__c, Active__c
                FROM Program__c
                WHERE Id = :p.Id
                WITH USER_MODE
            ];
            Assert.areEqual('Master of Public Health', saved.Name, 'Name is saved');
            Assert.areEqual('MPH-01', saved.Program_Code__c, 'Program Code is saved');
            Assert.areEqual('Postgraduate_Coursework', saved.Study_Level__c, 'Study Level is saved');
            Assert.areEqual('Health', saved.Faculty__c, 'Faculty is saved');
            Assert.isTrue(saved.Active__c, 'Active is saved');
        }
    }

    @IsTest
    static void shouldOfferExactlyTheThreeStudyLevelsAsRestrictedPicklist() {
        Schema.DescribeFieldResult field;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            field = Program__c.Study_Level__c.getDescribe();
        }
        Assert.isTrue(field.isRestrictedPicklist(), 'Study Level is a restricted picklist (DM-08)');
        Map<String, String> labelsByValue = activeValues(field);
        Assert.areEqual(
            new Map<String, String>{
                'Undergraduate' => 'Undergraduate',
                'Postgraduate_Coursework' => 'Postgraduate coursework',
                'Research' => 'Research'
            },
            labelsByValue,
            'Study Level offers exactly Undergraduate, Postgraduate coursework and Research'
        );
    }

    @IsTest
    static void shouldOfferExactlyTheFiveFacultiesAsRestrictedPicklist() {
        Schema.DescribeFieldResult field;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            field = Program__c.Faculty__c.getDescribe();
        }
        Assert.isTrue(field.isRestrictedPicklist(), 'Faculty is a restricted picklist (DM-08)');
        Assert.areEqual(
            new Map<String, String>{
                'Arts_Humanities' => 'Arts and Humanities',
                'Business' => 'Business',
                'Education' => 'Education',
                'Health' => 'Health',
                'Science_Engineering' => 'Science and Engineering'
            },
            activeValues(field),
            'Faculty offers the five faculties agreed in the plan decisions'
        );
    }

    @IsTest
    static void shouldDefaultNewProgramsToActive() {
        Program__c p;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            p = (Program__c) Program__c.SObjectType.newSObject(null, true);
        }
        Assert.isTrue(p.Active__c, 'A new Program starts active');
    }

    @IsTest
    static void shouldCreate200ProgramsInOneTransaction() {
        List<Program__c> programs = TestDataFactory.buildPrograms(200, 'BULK');
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            Database.insert(programs, AccessLevel.USER_MODE);
            Test.stopTest();
            Assert.areEqual(
                200,
                [SELECT COUNT() FROM Program__c WHERE Program_Code__c LIKE 'BULK-%' WITH USER_MODE],
                'All 200 Programs are saved and visible to the persona'
            );
        }
    }

    // AC2: Program Code is unique and required; a duplicate gives a clear error.

    @IsTest
    static void shouldMakeProgramCodeAUniqueRequiredExternalId() {
        Schema.DescribeFieldResult field;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            field = Program__c.Program_Code__c.getDescribe();
        }
        Assert.isTrue(field.isUnique(), 'Program Code is unique');
        Assert.isFalse(field.isCaseSensitive(), 'Program Code uniqueness ignores case');
        Assert.isTrue(field.isExternalId(), 'Program Code is the student system key (DM-07)');
        Assert.isFalse(field.isNillable(), 'Program Code is required');
        Assert.areEqual(20, field.getLength(), 'Program Code is Text(20)');
    }

    @IsTest
    static void shouldRejectDuplicateProgramCode() {
        Program__c first = TestDataFactory.buildPrograms(1, 'DUP')[0];
        Program__c second = TestDataFactory.buildPrograms(1, 'DUP')[0];
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Database.insert(first, AccessLevel.USER_MODE);
            Test.startTest();
            try {
                Database.insert(second, AccessLevel.USER_MODE);
                Assert.fail('A second Program with the same code must not save');
            } catch (System.DmlException e) {
                Assert.areEqual(StatusCode.DUPLICATE_VALUE, e.getDmlType(0), 'The error is a duplicate-value error');
                Assert.isTrue(e.getDmlMessage(0).containsIgnoreCase('duplicate value'), 'The message says the value is a duplicate: ' + e.getDmlMessage(0));
            }
            Test.stopTest();
        }
        Assert.areEqual(1, [SELECT COUNT() FROM Program__c WHERE Program_Code__c = 'DUP-0'], 'Only the first Program exists');
    }

    @IsTest
    static void shouldRejectDuplicateProgramCodeInDifferentCase() {
        Program__c first = TestDataFactory.buildPrograms(1, 'CASE')[0];
        Program__c second = TestDataFactory.buildPrograms(1, 'CASE')[0];
        second.Program_Code__c = 'case-0';
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Database.insert(first, AccessLevel.USER_MODE);
            Test.startTest();
            try {
                Database.insert(second, AccessLevel.USER_MODE);
                Assert.fail('A code differing only in case is a duplicate');
            } catch (System.DmlException e) {
                Assert.areEqual(StatusCode.DUPLICATE_VALUE, e.getDmlType(0), 'The error is a duplicate-value error');
            }
            Test.stopTest();
        }
    }

    @IsTest
    static void shouldRequireProgramCode() {
        Program__c p = TestDataFactory.buildPrograms(1, 'REQ')[0];
        p.Program_Code__c = null;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            try {
                Database.insert(p, AccessLevel.USER_MODE);
                Assert.fail('A Program without a code must not save');
            } catch (System.DmlException e) {
                Assert.areEqual(StatusCode.REQUIRED_FIELD_MISSING, e.getDmlType(0), 'The error is a required-field error');
                Assert.isTrue(e.getDmlFieldNames(0).contains('Program_Code__c'), 'The error names Program Code');
            }
            Test.stopTest();
        }
    }

    // AC3: Recruitment users create and edit Programs through a permission set, not a profile.

    @IsTest
    static void shouldLetRecruitmentOfficerEditAProgramCreatedBySomeoneElse() {
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Program__c p = [SELECT Id FROM Program__c WHERE Program_Code__c = 'SETUP-0' WITH USER_MODE];
            p.Study_Level__c = 'Research';
            p.Faculty__c = 'Education';
            p.Active__c = false;
            Test.startTest();
            Database.update(p, AccessLevel.USER_MODE);
            Test.stopTest();
        }
        // System mode on purpose (APX-22): the test runner holds no FLS on Program fields.
        Program__c saved = [SELECT Study_Level__c, Faculty__c, Active__c FROM Program__c WHERE Program_Code__c = 'SETUP-0' WITH SYSTEM_MODE];
        Assert.areEqual('Research', saved.Study_Level__c, 'Study Level is updated');
        Assert.areEqual('Education', saved.Faculty__c, 'Faculty is updated');
        Assert.isFalse(saved.Active__c, 'Program is deactivated');
    }

    @IsTest
    static void shouldGrantProgramAccessThroughPermissionSetNotProfile() {
        Schema.DescribeSObjectResult obj;
        Map<String, Boolean> updateableByField = new Map<String, Boolean>();
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            obj = Program__c.SObjectType.getDescribe();
            Map<String, Schema.SObjectField> fields = obj.fields.getMap();
            // Field describes are evaluated for the current user, so read them inside runAs.
            for (String f : new List<String>{ 'Study_Level__c', 'Faculty__c', 'Active__c' }) {
                updateableByField.put(f, fields.get(f).getDescribe().isUpdateable());
            }
        }
        Assert.isTrue(obj.isAccessible() && obj.isCreateable() && obj.isUpdateable(), 'Persona can read, create and edit Programs');
        Assert.isFalse(obj.isDeletable(), 'Persona cannot delete Programs (deactivate instead)');
        for (String f : updateableByField.keySet()) {
            Assert.isTrue(updateableByField.get(f), 'Persona can edit ' + f);
        }

        List<ObjectPermissions> fromPermissionSet = [
            SELECT PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, PermissionsViewAllRecords, PermissionsModifyAllRecords
            FROM ObjectPermissions
            WHERE SobjectType = 'Program__c' AND Parent.Name = 'Persona_Recruitment_Officer'
        ];
        Assert.areEqual(1, fromPermissionSet.size(), 'Persona_Recruitment_Officer grants Program access');
        ObjectPermissions op = fromPermissionSet[0];
        Assert.isTrue(op.PermissionsRead && op.PermissionsCreate && op.PermissionsEdit, 'Permission set grants Read, Create and Edit');
        Assert.isFalse(op.PermissionsDelete, 'Permission set does not grant Delete');
        Assert.isFalse(op.PermissionsViewAllRecords || op.PermissionsModifyAllRecords, 'Permission set grants no View All or Modify All');

        Assert.areEqual(
            0,
            [SELECT COUNT() FROM ObjectPermissions WHERE SobjectType = 'Program__c' AND Parent.IsOwnedByProfile = TRUE AND Parent.Profile.Name = 'Persona Base'],
            'The Persona Base profile grants no Program access (06 §6.1)'
        );
    }

    @IsTest
    static void shouldRefuseProgramDeleteToRecruitmentOfficer() {
        Boolean refused = false;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Program__c p = [SELECT Id FROM Program__c WHERE Program_Code__c = 'SETUP-0' WITH USER_MODE];
            Test.startTest();
            try {
                Database.delete(p, AccessLevel.USER_MODE);
            } catch (System.SecurityException e) {
                refused = true;
            } catch (System.NoAccessException e) {
                refused = true;
            } catch (System.DmlException e) {
                refused = true;
            } catch (System.TypeException e) {
                // User mode reports a missing object permission as "DML operation DELETE not allowed on Program__c".
                refused = e.getMessage().contains('DELETE not allowed');
            }
            Test.stopTest();
        }
        Assert.isTrue(refused, 'The Recruitment Officer must not delete Programs');
        Assert.areEqual(1, [SELECT COUNT() FROM Program__c WHERE Program_Code__c = 'SETUP-0'], 'The Program still exists');
    }

    @IsTest
    static void shouldRefuseProgramCreationToMinimumAccessPersona() {
        Program__c p = TestDataFactory.buildPrograms(1, 'DENY')[0];
        Boolean refused = false;
        System.runAs(TestPersonaFactory.get(TestPersonas.MINIMUM_ACCESS)) {
            try {
                Database.insert(p, AccessLevel.USER_MODE);
            } catch (System.SecurityException e) {
                refused = true;
            } catch (System.NoAccessException e) {
                refused = true;
            } catch (System.DmlException e) {
                refused = true;
            }
        }
        Assert.isTrue(refused, 'A persona with no Program access must not create Programs');
        Assert.areEqual(0, [SELECT COUNT() FROM Program__c WHERE Program_Code__c = 'DENY-0'], 'No Program was saved');
    }

    @IsTest
    static void shouldRefuseProgramReadToMinimumAccessPersona() {
        Boolean refused = false;
        System.runAs(TestPersonaFactory.get(TestPersonas.MINIMUM_ACCESS)) {
            try {
                Integer visible = [SELECT COUNT() FROM Program__c WITH USER_MODE];
                Assert.fail('The persona read ' + visible + ' Programs');
            } catch (System.QueryException e) {
                refused = true;
            } catch (System.NoAccessException e) {
                refused = true;
            } catch (System.SecurityException e) {
                refused = true;
            }
        }
        Assert.isTrue(refused, 'A persona with no Program access must not read Programs');
    }

    // AC4: a Programs tab and a list view of active Programs.

    @IsTest
    static void shouldShipActiveProgramsListViewVisibleToRecruitmentOfficer() {
        List<ListView> views;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            views = [SELECT Id, Name FROM ListView WHERE SobjectType = 'Program__c' AND DeveloperName = 'Active_Programs' WITH USER_MODE];
        }
        Assert.areEqual(1, views.size(), 'The Active Programs list view exists and the persona can see it');
    }

    @IsTest
    static void shouldShowProgramsTabInRecruitmentApp() {
        // Schema.describeTabs() lists Classic apps only; Recruitment is a Lightning app, so read its tabs
        // through AppDefinition and AppTabMember, which return only apps the persona can open.
        List<AppDefinition> apps;
        Integer programTabsInApp = 0;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            apps = [SELECT DurableId FROM AppDefinition WHERE DeveloperName = 'Recruitment'];
            if (!apps.isEmpty()) {
                programTabsInApp = [
                    SELECT COUNT()
                    FROM AppTabMember
                    WHERE AppDefinitionId = :apps[0].DurableId AND TabDefinition.SobjectName = 'Program__c'
                ];
            }
        }
        Assert.areEqual(1, apps.size(), 'The persona can open the Recruitment app');
        Assert.areEqual(1, programTabsInApp, 'The Recruitment app holds the Programs tab');
        Assert.areEqual(
            1,
            [
                SELECT COUNT()
                FROM PermissionSetTabSetting
                WHERE Name = 'Program__c' AND Parent.Name = 'Persona_Recruitment_Officer' AND Visibility IN ('DefaultOn', 'Visible')
            ],
            'Persona_Recruitment_Officer makes the Programs tab visible'
        );
    }

    private static Map<String, String> activeValues(Schema.DescribeFieldResult field) {
        Map<String, String> labelsByValue = new Map<String, String>();
        for (Schema.PicklistEntry e : field.getPicklistValues()) {
            if (e.isActive()) {
                labelsByValue.put(e.getValue(), e.getLabel());
            }
        }
        return labelsByValue;
    }
}
