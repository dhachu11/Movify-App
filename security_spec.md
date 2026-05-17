# Security Specification - CineFlow AI

## Data Invariants
1. A post must have a valid `tmdbId` (though we switched to `imdbId` now for OMDB, I should update the blueprint).
2. A post must have `articleHtml` and `publishedAt`.
3. Only the server (admin) can write posts.
4. Settings are read-only for public, write-only for admin.

## The "Dirty Dozen" Payloads
1. **The Ghost Field**: Creating a post with an extra `isVerified: true` field.
2. **Missing Required**: Creating a post without `articleHtml`.
3. **Invalid ID**: Using a 2KB string as `imdbId`.
4. **Spoofed Date**: Setting `publishedAt` to a future date from the client.
5. **Unauthorized Write**: An unauthenticated user attempting to create a post.
6. **Immutable Field Attack**: Attempting to update `imdbId` on an existing post.
7. **Type Poisoning**: Sending `rating` as a string "excellent".
8. **Shadow Update**: Attempting to change `movieTitle` without authorization.
9. **Settings Hijack**: Attempting to overwrite global app settings.
10. **Huge Body**: Sending a 2MB `metaDescription`.
11. **Tag Overflow**: Sending a list of 1000 tags.
12. **Status Bypass**: Setting `status` to an undefined value like "admin-published".

## Test Runner
A `firestore.rules.test.ts` will be created to verify these.
