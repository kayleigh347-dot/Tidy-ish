# Tidy-ish Alexa skill

The first Alexa version lets a linked user add a task to one already-synced Tidy-ish household. Say:

> Alexa, open Tidy-ish. Add wipe the worktops in the kitchen.

Alexa asks you to confirm the task and room before saving. If you leave the room out, it uses Tidy-ish's General list. The skill checks that the household exists, the room matches, and an active task with the same title and room is not already there. It writes through the existing authenticated Tidy-ish household APIs and uses the same task projection as the web app.

Browser-only boards are not visible to Alexa. Before linking, the household must have been signed in and synced from Tidy-ish. The Alexa account-linking page asks which synced household to use. A task is not saved until you confirm it aloud.

## What's included

- `interaction-model/en-GB.json` — importable custom-skill voice model.
- `lambda/index.js` — AWS Lambda handler. Alexa requests are checked against the skill ID, and Supabase requests use the linked user's token rather than a service-role key.
- `oauth/consent/index.html` — the hosted sign-in and household-selection page used during Alexa account linking.

The skill currently adds tasks only. It does not mark tasks complete or read the task list aloud.

## Required account setup

The code is prepared, but Alexa cannot be enabled until the Supabase and Amazon developer settings are configured.

1. In the Supabase project for Tidy-ish, enable **Authentication → OAuth Server**. Supabase currently labels this OAuth 2.1 server feature as beta.
2. Set the Supabase Site URL to `https://kayleigh347-dot.github.io/Tidy-ish` and the OAuth authorization path to `/oauth/consent/`. Add `https://kayleigh347-dot.github.io/Tidy-ish/oauth/consent/**` to the Supabase Auth redirect URL allowlist. The sign-in email needs to return to this page with its `authorization_id` query parameter intact.
3. Create a **confidential OAuth client** in Supabase named `Tidy-ish Alexa`. Register the Alexa redirect URL shown in the Alexa account-linking settings as the client's exact redirect URI. Keep the client secret in the Amazon developer console; never add it to this repository.
4. Create an Alexa **Custom Skill**, import `interaction-model/en-GB.json`, and enable account linking with the authorization-code grant and PKCE. Set its authorization URI to `https://thviqhojcjrmqurhdkql.supabase.co/auth/v1/oauth/authorize` and its token URI to `https://thviqhojcjrmqurhdkql.supabase.co/auth/v1/oauth/token`. Use the client ID and secret from the Supabase OAuth client.
5. Build and upload the Lambda package from the repository root:

   ```sh
   cd alexa
   npm install --omit=dev
   cd ..
   zip -r alexa/tidyish-alexa.zip alexa/lambda/index.js alexa/node_modules js/model.js js/sharing-model.js
   ```

6. Create an AWS Lambda function using the supported `nodejs22.x` runtime. Set its handler to `alexa/lambda/index.handler`, upload `alexa/tidyish-alexa.zip`, use 256 MB memory and a 7-second timeout, and configure these environment variables. Each voice request aborts its Supabase calls after 6 seconds so the skill can return before Alexa's response limit:

   - `ALEXA_SKILL_ID` — the skill ID from the Alexa developer console.
   - `SUPABASE_URL` — `https://thviqhojcjrmqurhdkql.supabase.co`.
   - `SUPABASE_PUBLISHABLE_KEY` — the existing public key in `js/sharing.js`.

7. Add the Alexa Skills Kit trigger for the skill ID to the Lambda function, then set the skill endpoint to the function ARN. Use the Supabase OAuth client ID and secret in Alexa's account-linking settings, request the `email` scope if Alexa requires a scope, and select authorization-code grant with PKCE. Test the development skill with a synced household before submitting it for Amazon review.

Use the Alexa developer console's exact redirect URL and token-authentication choices when registering the OAuth client. Supabase requires the OAuth Server feature to be enabled for its OAuth endpoints to work. Account linking is optional for a custom skill generally, but Tidy-ish task actions require it.

## Data and privacy behavior

- The approval page stores the chosen household ID in the signed-in user's Tidy-ish profile metadata. The Lambda checks that the household is still in that user's accessible household list before reading or writing it.
- Requests use the linked user's Supabase access token and existing row-level household permissions. No Supabase service-role key is used by the skill.
- Task titles and room names are spoken back for confirmation. The task is added only after Alexa reports an explicit confirmation.
- The task save uses the board revision supplied by Supabase and retries if the board changed concurrently. If a network failure makes the save result uncertain, Alexa asks you to check Tidy-ish before trying again.
- The OAuth client and skill must be unlinked from their respective dashboards to revoke future access. Existing browser-only data is never uploaded by the consent page.
