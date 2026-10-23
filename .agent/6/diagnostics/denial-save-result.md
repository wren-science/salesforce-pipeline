# Minimum Access denial with the DMLOptions insert overload (run 1, 2026-10-23)

`Database.insert(leads, options /* optAllOrNone = false */, AccessLevel.USER_MODE)` run as `MINIMUM_ACCESS` did not throw.
It returned a failed SaveResult:

    Database.Error[getFields=();getMessage=Access to entity 'Lead' denied;getStatusCode=CANNOT_INSERT_UPDATE_ACTIVATE_ENTITY;]

So with partial success, user mode reports the missing object permission per row (as with a DuplicateError), not as
System.SecurityException. The #5 test that throws uses `Database.insert(record, AccessLevel.USER_MODE)` (all-or-none).
