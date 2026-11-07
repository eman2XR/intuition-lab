# Build briefs

Each `<id>.json` here is a ready-to-build brief for a waiting question: a question whose picture engine does not
exist yet. On an idle publishing morning the daily run researches the next waiting question, with the same
researcher, scientist and designer steps a full investigation uses, and writes the result here instead of only
sketching a design.

A brief holds the question, the intended engine name (when the curriculum item names one), the full research record
(the model, formulas, assumptions and checks to implement) and the design brief (the picture plan: idea, start,
belief, reason, chapters and what the new engine must show). The matching `kind: blueprint` entry in
`web/proposals.json` surfaces it to the owner.

Briefs are internal build inputs, not public pages: the daily run commits and pushes them, but they are not deployed
to the site. A supervised coding session builds the picture engine from a brief (see the handoff's "Adding a picture
engine and marking it ready"), then marks the model ready; the brief can then be removed.
