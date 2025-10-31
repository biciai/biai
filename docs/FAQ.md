# BIAI Frequently Asked Questions (FAQ)

Common questions and answers about using BIAI.

## General Questions

### What is BIAI?
BIAI (Business Intelligence AI) is a web-based data exploration and visualization tool. It helps you analyze datasets with multiple related tables through interactive charts, filters, and relationship-aware querying.

### Who is BIAI for?
BIAI is designed for anyone who needs to explore and analyze data, from researchers and analysts to business users. No programming knowledge is required to use the web interface.

### Do I need to install anything?
No. BIAI is a web application that runs in your browser. Just navigate to the URL provided by your administrator.

### Which browsers are supported?
BIAI works best with modern web browsers including Chrome, Firefox, Safari, and Edge. Make sure your browser is up to date for the best experience.

---

## Working with Datasets

### How do I access a dataset?
1. Go to the **Datasets** page (home page)
2. Browse the available datasets
3. Click on the dataset card to open it in the explorer

### Can I upload my own data?
No, not through the web interface. Dataset uploads and management are handled by administrators. Contact your system administrator if you need a new dataset added.

### Why can't I see any datasets?
If you don't see any datasets on the home page, either:
- No datasets have been created yet (contact your administrator)
- There may be a connection issue (try refreshing the page)
- You may not have the correct URL (verify with your administrator)

### What does "Created" vs "Connected" mean for datasets?
- **Created**: Dataset uploaded directly to BIAI's database
- **Connected**: Dataset connected from an external ClickHouse database

This distinction is mainly for administrators. As an end-user, you can work with both types the same way.

---

## Visualizations

### Why do some columns show charts and others show tables?
BIAI automatically chooses the best visualization:
- **Categorical columns with ≤8 categories**: Pie chart
- **Categorical columns with >8 categories**: Bar chart or table view
- **Numeric columns**: Histogram

You can manually toggle between chart and table view using the button above each visualization.

### Can I change the chart type?
You can toggle between chart and table view for categorical columns. The specific chart type (pie vs bar) is automatically selected based on the number of categories, but you can always switch to table view if you prefer.

### Why is a table view shown instead of a chart?
Table view is automatically used when a categorical column has more than 8 unique values. This makes it easier to browse and find specific categories. You can still switch to a chart view if you prefer.

### What are the numbers on the visualizations?
- **Pie charts**: Show percentages for each category
- **Bar charts**: Show counts (hover to see exact numbers)
- **Histograms**: Show counts in each bin/range
- **Table view**: Shows category name, count, and percentage

### How do I see more categories in table view?
The table view shows the top 100 categories by default, sorted by count (most common first). If your column has more than 100 unique values, you'll see the most frequent ones.

---

## Filtering

### How do I filter the data?
Simply click on any chart element (pie slice, bar, table row) to filter for that value. You can also:
- Click multiple values in the same column for OR filtering
- Drag on histograms to select numeric ranges
- Use the NOT button (¬) to exclude values

### What's the difference between AND and OR filtering?
- **AND logic**: Filters on different columns (all must be true)
  - Example: Age > 50 AND Gender = Male
- **OR logic**: Multiple values in the same column (any can be true)
  - Example: Country = USA OR Country = Canada

### How do I filter multiple values from the same column?
Click on multiple chart elements or table rows in the same column. They'll be combined with OR logic automatically.

### What does the NOT operator (¬) do?
The NOT operator inverts a filter to show everything EXCEPT the selected value(s):
- Normal filter: Gender = Male (shows only males)
- NOT filter: NOT Gender = Male (shows everyone except males)

### How do I remove filters?
- **Single filter**: Click the × button in the Active Filters bar
- **Column reset**: Click the Reset button on that column's visualization
- **All filters**: Click the Clear All button at the top

### Why do I see 0 rows after filtering?
This means no records match all of your current filters. Your filters may be too restrictive or contradictory. Try:
- Removing some filters to broaden your criteria
- Checking for logical conflicts (e.g., Age > 80 AND Age < 30)
- Verifying that the data actually contains the values you're filtering for

### Can I filter for null/missing values?
Yes. Null values appear as "(null)" in filter menus and table views. Click on them just like any other value to filter for records with missing data.

---

## Filter Presets

### What are filter presets?
Filter presets let you save a combination of filters with a name (e.g., "Elderly Patients", "2023 Q1 Data") and load them quickly later. This is useful for analyses you perform regularly.

### How do I create a preset?
1. Apply the filters you want to save
2. Click the **Filter Presets** button
3. Enter a descriptive name
4. Click **Save**

### Where are my presets stored?
Presets are stored in your browser's local storage, per dataset. They're specific to you and your browser.

### Can I share presets with others?
Yes, using the export/import feature:
1. Click **Manage Presets**
2. Click **Export** to save presets as a JSON file
3. Share the file with colleagues
4. They can click **Import** to load your presets

### Can I rename or delete presets?
Yes:
- Click **Manage Presets**
- Click the **edit icon** to rename
- Click the **trash icon** to delete

---

## Relationships Between Tables

### What are table relationships?
Relationships connect tables through foreign keys. For example:
- A "Samples" table might reference a "Patients" table
- Each sample belongs to one patient
- This creates a relationship between the tables

### How do relationships affect filtering?
When you filter one table, related tables are automatically filtered:
- Filter Patients for Age > 50
- The Samples table automatically shows only samples from those patients
- This keeps your analysis consistent across all tables

### What are direct vs propagated filters?
- **Direct filters**: You applied them directly by clicking on that table's visualizations
- **Propagated filters**: Automatically applied based on filters on related tables

### What does "hop count" mean?
Hop count shows how many relationships away a propagated filter is:
- **1 hop**: Directly related table
- **2 hops**: Related through one intermediate table
- Example: Patients → Samples → Tests (Tests is 2 hops from Patients)

### How do I know which filters are affecting a table?
Look at the table header badges:
- **Direct filter badge**: Number of filters applied directly to this table
- **Linked filter badge**: Number of propagated filters (with hop count)

---

## Sharing and Collaboration

### How do I share my analysis with others?
The easiest way is to copy the URL from your browser's address bar. BIAI automatically encodes your filters in the URL, so anyone who opens it will see the same filtered view.

### Do shared URLs work for everyone?
Yes, as long as they have access to the BIAI instance and the dataset. The filters are encoded in the URL itself.

### Will my filters persist if I close the browser?
Yes. BIAI saves your filters in two ways:
- In the URL (for sharing and bookmarking)
- In local storage (as a backup)

When you return, your filters should still be there.

### Can multiple people work on the same dataset?
Yes. Each person has their own filters and view settings. Your filters don't affect what others see unless you share your URL with them.

---

## Performance and Data

### Why is the data loading slowly?
Large datasets with complex filters may take time to process. Factors that affect speed:
- Dataset size (millions of rows take longer)
- Number of active filters
- Complexity of table relationships
- Server load

If performance is consistently slow, contact your administrator.

### Why do some tables have fewer rows after filtering?
This is expected behavior with relationships. When you filter a parent table (e.g., Patients), child tables (e.g., Samples) are automatically filtered to show only related records.

### Is there a limit to how much data I can view?
Yes, for display purposes:
- Table previews show up to 100 rows
- Visualizations show all aggregated data
- The actual filtering works on the full dataset

This is for performance and usability. The aggregations and counts reflect the complete data.

### Can I export filtered data?
Currently, BIAI is focused on interactive exploration and visualization. Data export features may be available in future versions. Contact your administrator if you need to export data.

---

## Troubleshooting

### The page isn't loading
Try these steps:
1. Refresh your browser (Ctrl+R or Cmd+R)
2. Clear your browser cache
3. Try a different browser
4. Check your internet connection
5. Contact your system administrator

### I can't see any visualizations
Possible causes:
- No data in the dataset
- Filters are too restrictive (showing 0 rows)
- Browser compatibility issue
- JavaScript is disabled

Try clearing all filters first. If the problem persists, try a different browser.

### My filters disappeared
Filters are saved in your browser's local storage and in the URL. If they disappeared:
- Check if the URL still contains filter parameters (hash after #)
- Try clicking the back button in your browser
- Check if your browser's local storage was cleared

### Why do some colors look different?
Each table has a unique color for easy identification. These colors are:
- Assigned automatically
- Used consistently throughout the interface
- Shown in table headers, filter badges, and active filters

### The numbers don't add up
If you're seeing unexpected counts:
- Make sure you understand the difference between direct and propagated filters
- Check the row count display (filtered vs total)
- Remember that relationship filtering affects child tables automatically
- Verify that you're looking at the right table

### I found a bug or have feedback
Contact your system administrator to report issues or suggest improvements. Include:
- What you were trying to do
- What happened vs what you expected
- The URL (which includes your current state)
- Your browser and version

---

## Additional Help

### Where can I learn more?
- **[User Guide](USER_GUIDE.md)**: Comprehensive documentation with detailed explanations
- **[Quick Reference](QUICK_REFERENCE.md)**: At-a-glance guide for common tasks
- **Contact Support**: Reach out to your system administrator for help

### Are there video tutorials?
Check with your system administrator to see if your organization has created any training materials or video tutorials for BIAI.

### Can I customize the interface?
The current version of BIAI has a fixed interface design. Some customizations (like chart vs table view preferences) are saved automatically per user. Contact your administrator if you need specific customizations.

---

**Still have questions?** Contact your system administrator or refer to the [User Guide](USER_GUIDE.md) for more detailed information.
