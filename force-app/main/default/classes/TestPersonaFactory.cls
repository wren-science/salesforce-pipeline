/**
 * Builds persona users the way production users are provisioned (06 §6.1): the persona's profile,
 * its permission set group and membership of its persona public group. Create in @TestSetup,
 * fetch with get() in each test (TST-18).
 */
@IsTest
public class TestPersonaFactory {
    private static final String USERNAME_SUFFIX = '@persona.test.' + UserInfo.getOrganizationId() + '.invalid';

    /** Call once from @TestSetup. Setup DML runs as the current user to avoid mixed DML errors. */
    public static void createAll(List<TestPersonas.Definition> personas) {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Set<String> profileNames = new Set<String>();
            Set<String> psgNames = new Set<String>();
            Set<String> groupNames = new Set<String>();
            for (TestPersonas.Definition p : personas) {
                profileNames.add(p.profileName);
                if (p.psgDeveloperName != null) {
                    psgNames.add(p.psgDeveloperName);
                }
                if (p.publicGroupDeveloperName != null) {
                    groupNames.add(p.publicGroupDeveloperName);
                }
            }
            Map<String, Id> profileIds = new Map<String, Id>();
            for (Profile pr : [SELECT Id, Name FROM Profile WHERE Name IN :profileNames]) {
                profileIds.put(pr.Name, pr.Id);
            }
            Map<String, Id> psgIds = new Map<String, Id>();
            for (PermissionSetGroup g : [SELECT Id, DeveloperName FROM PermissionSetGroup WHERE DeveloperName IN :psgNames]) {
                psgIds.put(g.DeveloperName, g.Id);
            }
            Map<String, Id> groupIds = new Map<String, Id>();
            for (Group g : [SELECT Id, DeveloperName FROM Group WHERE DeveloperName IN :groupNames AND Type = 'Regular']) {
                groupIds.put(g.DeveloperName, g.Id);
            }
            if (!psgIds.isEmpty()) {
                Test.calculatePermissionSetGroup(new List<Id>(psgIds.values()));
            }

            List<User> users = new List<User>();
            for (TestPersonas.Definition p : personas) {
                Assert.isTrue(profileIds.containsKey(p.profileName), 'Profile not found: ' + p.profileName);
                users.add(
                    new User(
                        ProfileId = profileIds.get(p.profileName),
                        Username = p.key.toLowerCase() + USERNAME_SUFFIX,
                        Alias = p.key.left(8),
                        LastName = 'Persona ' + p.key,
                        Email = p.key.toLowerCase() + '@example.invalid',
                        TimeZoneSidKey = 'Australia/Brisbane',
                        LocaleSidKey = 'en_AU',
                        LanguageLocaleKey = 'en_US',
                        EmailEncodingKey = 'UTF-8'
                    )
                );
            }
            insert users;

            List<PermissionSetAssignment> psas = new List<PermissionSetAssignment>();
            List<GroupMember> members = new List<GroupMember>();
            for (Integer i = 0; i < personas.size(); i++) {
                TestPersonas.Definition p = personas[i];
                if (p.psgDeveloperName != null) {
                    Assert.isTrue(psgIds.containsKey(p.psgDeveloperName), 'PSG not found: ' + p.psgDeveloperName);
                    psas.add(new PermissionSetAssignment(AssigneeId = users[i].Id, PermissionSetGroupId = psgIds.get(p.psgDeveloperName)));
                }
                if (p.publicGroupDeveloperName != null) {
                    Assert.isTrue(groupIds.containsKey(p.publicGroupDeveloperName), 'Group not found: ' + p.publicGroupDeveloperName);
                    members.add(new GroupMember(GroupId = groupIds.get(p.publicGroupDeveloperName), UserOrGroupId = users[i].Id));
                }
            }
            insert psas;
            insert members;
        }
    }

    public static User get(TestPersonas.Definition p) {
        return [SELECT Id FROM User WHERE Username = :(p.key.toLowerCase() + USERNAME_SUFFIX) LIMIT 1];
    }
}
