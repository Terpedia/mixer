# Terpedia Mixer
Each Rx is a versioned JSON record with an ID, a batch mass, target and estimated terpene percentages, and ingredient lines containing grams and a snapshot of the composition used. The browser library and JSON export preserve that record for later Joomla integration.

Serve docs/ with any static server. GitHub Pages uses main /docs. The editable catalog accepts arbitrary ingredient types. Profile values must be mass percentages on the as-supplied material basis. All seed profiles are synthetic examples. Missing entries are modeled as zero. The solver minimizes squared percentage-point deviations across all tracked compounds subject to nonnegative ingredient masses totaling the batch mass.

## Recipe forks and Joomla discussions

Fork recipe opens an editable copy. Saving assigns a new UUID and records the immediate source in parentId. A root recipe has a null parentId. Forks inherit the target profile, batch size, and available ingredient IDs. Older records use the ingredients present in the saved blend. Calculations use the current catalog. Each saved result keeps its own ingredient snapshots.

For the Joomla migration, preserve these UUIDs on import and give each published Rx a permanent detail page. Show its parent, direct forks, and a discussion thread on that page. A user exploring a substitution can follow the source discussion, fork the recipe, and post their observations on the resulting variation.

Store each comment with its own ID, recipe UUID, Joomla author ID, creation time, moderation state, text, and optional reply-to comment ID within the same recipe. Start a fresh thread on each fork and link back to the parent discussion. Resolve authors from the authenticated Joomla session and enforce recipe visibility on comments and fork links. Shared threads and cross-user forks require Joomla storage. The static mixer currently saves recipes per browser.

## Supplier-listed isolates

The isolate picker uses the exact full InChIKey matches in Terpedia's structure-resolved Mondays/Terokit export. This covers a subset of the TeroKit V2.5 purchasability file. Supplier codes are historical leads. Connectivity-only matches are excluded because they can conflate stereoisomers. Users supply the mass assay for their material and the chosen listing and assay travel with the Rx ingredient snapshot.

Refresh with `python3 scripts/import-terokit.py ../terproduct/bigquery/data/mondays-terokit-structure-supplier-leads.csv`.
