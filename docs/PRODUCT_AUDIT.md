# Opsync Construction CRM

## Product position

Opsync is an operational CRM for construction-material suppliers. It connects incoming demand, technical qualification, commercial offers, contractors, delivery and payment in one workspace.

## Current system

- Clients: Facebook and manual leads, shared status pipeline, comments and history, next actions, contact channels, SLA and manager qualification briefs.
- Projects: object records, client assignment, dimensions, photos, files, questionnaire answers and contractor assignment.
- Databases: construction firms, contractors and a separate tire customer base.
- Sales operations: offer preparation, invoices, payments, delivery and logistics views for administration.
- Team operations: manager workspace, admin daily tasks, employee activity and agent reports.
- Marketing: Facebook Ads data, campaign metrics, lead synchronization and campaign recommendations.
- Catalog: product catalog used by the offer workflow.
- Integrations: Render API, Neon/Postgres deployment, Facebook Lead Ads, Google Sheets and Google Forms, Gmail compose/OAuth.

## Core value

The product is valuable when it reduces the time from a new request to a technically complete offer. Construction sales are not ordinary contact sales: every lead needs an object brief, quantities, problem classification, delivery context and often a contractor. Opsync keeps this information with the customer instead of scattering it across calls, spreadsheets and chat.

## Strong points

1. The workflow is tailored to construction materials and project requests.
2. Managers collect structured technical information during the call.
3. SLA timestamps show when a lead arrived and when the first contact happened.
4. Projects, contractors and clients can be connected in the same workspace.
5. Facebook lead intake and follow-up actions reduce manual copying.
6. The system can be demonstrated with a realistic end-to-end flow: lead, brief, offer, invoice, payment and delivery.

## Current limitations

- External Facebook and Google permissions, quotas and tokens can interrupt synchronization.
- The strongest differentiator, technical qualification, still needs consistent completion by managers.
- Lost-lead reasons and conversion reporting should be made mandatory before using the system for market conclusions.
- Gmail compose is dependent on the signed-in Google account; real sender selection requires Gmail OAuth/send integration, not only a compose URL.
- A polished demo should use a clearly separated demo workspace and realistic but labeled sample data.

## Recommended next product layer

### 1. Offer calculator

Area or volume, consumption rate, reserve, margin, transport and VAT should produce a transparent draft offer. Every calculated value should remain editable by an administrator.

### 2. Loss analysis

Require a loss reason such as price, timing, no response, wrong fit, missing contractor, competitor or incomplete brief. Add a reason report by source, manager, client type and campaign.

### 3. Object workspace

Give each project a timeline, photos before/after, drawings, videos, technical files, questionnaire versions, selected materials and assigned contractor.

### 4. Follow-up automation

Generate a next action when a lead enters offer sent, invoice sent or no response. Keep the task visible until the manager records a touch or reschedules it.

### 5. Manager dashboard

Show new leads, first-response SLA, completed briefs, offers sent, overdue follow-ups, won deals and payments received. Keep the same metric definitions on every page.

### 6. Demo workspace

Include an explicit demo mode with 8–12 sample construction firms, projects, contractors and offers. It should be resettable and clearly labeled so prospects understand the workflow without seeing production data.

## Recommended demo narrative

New lead → qualify the problem and object → calculate quantities → prepare offer → assign contractor if needed → send offer → invoice → payment → delivery → won project.

