// Issue #5 developer probe: can the pipeline identity (no FLS on Program__c/Lead custom fields) set them from
// anonymous Apex via JSON.deserialize? Everything is rolled back.
Savepoint sp = Database.setSavepoint();
try {
    List<SObject> programs = (List<SObject>) JSON.deserialize(
        '[{"attributes":{"type":"Program__c"},"Name":"E2E probe","Program_Code__c":"E2E-PROBE-5","Active__c":false,"Study_Level__c":"Research","Faculty__c":"Health"}]',
        List<SObject>.class
    );
    Database.insert(programs, AccessLevel.SYSTEM_MODE);
    List<SObject> back = Database.query('SELECT Id, Active__c, Study_Level__c FROM Program__c WHERE Id = \'' + programs[0].Id + '\'', AccessLevel.SYSTEM_MODE);
    System.assertEquals(false, back[0].get('Active__c'), 'Active__c saved');
    System.assertEquals('Research', back[0].get('Study_Level__c'), 'Study_Level__c saved');
} finally {
    Database.rollback(sp);
}
