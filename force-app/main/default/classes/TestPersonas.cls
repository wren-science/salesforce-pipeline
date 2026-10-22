/**
 * API names of the metadata that implements each persona (06 §6.1). The Persona Catalogue
 * (config/personas.json) remains the definition of the persona; this class only references the
 * profile, permission set group and persona public group that implement it, and changes in the same
 * PR as those components.
 */
@IsTest
public class TestPersonas {
    public class Definition {
        public final String key;
        public final String profileName;
        public final String psgDeveloperName;
        public final String publicGroupDeveloperName;
        public Definition(String key, String profileName, String psgDeveloperName, String publicGroupDeveloperName) {
            this.key = key;
            this.profileName = profileName;
            this.psgDeveloperName = psgDeveloperName;
            this.publicGroupDeveloperName = publicGroupDeveloperName;
        }
    }

    /** Baseline: minimum access profile, no PSG. Used for pure utilities and denial tests. */
    public static final Definition MINIMUM_ACCESS = new Definition('MinimumAccess', 'Minimum Access - Salesforce', null, null);

    /** Recruitment Officer (sample persona, config/personas.json). */
    public static final Definition RECRUITMENT_OFFICER = new Definition(
        'RecruitmentOfficer', 'Persona Base', 'Recruitment_Officer', 'Persona_Recruitment_Officer'
    );

    public static List<Definition> all() {
        return new List<Definition>{ MINIMUM_ACCESS, RECRUITMENT_OFFICER };
    }
}
