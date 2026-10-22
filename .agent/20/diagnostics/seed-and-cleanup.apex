// Diagnostic (repair, #20): the Playwright seed and the narrowed afterAll cleanup from
// tests/e2e/specs/20-my-open-enquiries.spec.ts, run as one script against the agent sandbox.
String marker = 'PW20-diag-' + String.valueOf(Datetime.now().getTime());
Id personaId = [SELECT Id FROM User WHERE Username LIKE 'recruitment-officer.%@pipeline.%' AND IsActive = true LIMIT 1].Id;
List<Lead> seed = new List<Lead>{
  new Lead(LastName = 'Mine ' + marker, Company = marker, LeadSource = 'Web', OwnerId = personaId),
  new Lead(LastName = 'Other ' + marker, Company = marker, LeadSource = 'Web', OwnerId = UserInfo.getUserId()),
  new Lead(LastName = 'Converted ' + marker, Company = marker, LeadSource = 'Web', OwnerId = personaId)
};
insert seed;
Database.LeadConvert lc = new Database.LeadConvert();
lc.setLeadId(seed[2].Id);
lc.setConvertedStatus([SELECT ApiName FROM LeadStatus WHERE IsConverted = true LIMIT 1].ApiName);
lc.setDoNotCreateOpportunity(true);
lc.setOwnerId(UserInfo.getUserId());
Database.convertLead(lc);

List<Lead> leads = [SELECT Id, ConvertedContactId, ConvertedAccountId FROM Lead WHERE Company = :marker];
Set<Id> contactIds = new Set<Id>();
Set<Id> accountIds = new Set<Id>();
for (Lead l : leads) {
  if (l.ConvertedContactId != null) contactIds.add(l.ConvertedContactId);
  if (l.ConvertedAccountId != null) accountIds.add(l.ConvertedAccountId);
}
Integer others = [SELECT COUNT() FROM Contact WHERE AccountId IN :accountIds AND Id NOT IN :contactIds];
if (others > 0) throw new IllegalArgumentException('Converted Account has other Contacts; not deleting it');
delete [SELECT Id FROM Contact WHERE Id IN :contactIds];
delete [SELECT Id FROM Account WHERE Id IN :accountIds];
delete [SELECT Id FROM Lead WHERE Id IN :leads];

Integer left = [SELECT COUNT() FROM Lead WHERE Company = :marker]
  + [SELECT COUNT() FROM Contact WHERE Id IN :contactIds]
  + [SELECT COUNT() FROM Account WHERE Id IN :accountIds];
System.assertEquals(0, left, 'cleanup leaves nothing behind');
System.debug('DIAG others=' + others + ' contacts=' + contactIds.size() + ' accounts=' + accountIds.size() + ' left=' + left);
