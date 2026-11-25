# Terpedia Mixer
Each Rx is a versioned JSON record with an ID, a batch mass, target and estimated terpene percentages, and ingredient lines containing grams and a snapshot of the composition used. The browser library and JSON export preserve that record for later Joomla integration.

Serve docs/ with any static server. GitHub Pages uses main /docs. The editable catalog accepts arbitrary ingredient types. Profile values must be mass percentages on the as-supplied material basis. All seed profiles are synthetic examples. Missing entries are modeled as zero. The solver minimizes squared percentage-point deviations across all tracked compounds subject to nonnegative ingredient masses totaling the batch mass.
