# BIAI Quick Reference

A quick guide to common tasks and features in BIAI.

## Navigation

| Action | How To |
|--------|--------|
| View all datasets | Click **Datasets** in the main navigation |
| Open a dataset | Click on any dataset card |
| Return to datasets list | Click the back button or **Datasets** in navigation |
| Access dataset settings | Click the **pencil icon** in the dataset header |

## Viewing Data

| Feature | Description |
|---------|-------------|
| **Pie Chart** | Used for categorical data with ≤8 categories |
| **Bar Chart** | Used for categorical data with >8 categories |
| **Histogram** | Used for numeric data distributions |
| **Table View** | Alternative view for categorical data with many values |
| **Toggle View** | Click the view toggle button above any visualization |

## Filtering Basics

### Single Value Filter
- **Click** on a chart element (pie slice, bar, table row)
- Shows only records matching that value

### Multiple Value Filter (OR)
- **Click multiple values** in the same column
- Shows records matching ANY selected value
- Example: Click "Male" and "Female" to see both

### Range Filter (Numeric)
- **Drag** on histogram bins to select a range
- Or use **From/To input fields** for precise values
- Can select multiple ranges

### NOT Filter (Exclusion)
- Click the **¬ button** next to a filter
- Shows everything EXCEPT the filtered value
- Example: NOT Male = all non-male records

### Remove Filters
- **Single filter**: Click **×** in the Active Filters bar
- **Column filter**: Click **Reset** on the column
- **All filters**: Click **Clear All** button

## Filter Presets

| Action | How To |
|--------|--------|
| Save current filters | Click **Filter Presets** → Enter name → **Save** |
| Load a preset | Click **Filter Presets** dropdown → Select preset |
| Manage presets | Click **Manage Presets** button |
| Rename preset | In Manage Presets, click edit icon next to name |
| Delete preset | In Manage Presets, click trash icon |
| Export presets | Click **Export** in Manage Presets dialog |
| Import presets | Click **Import** in Manage Presets dialog |

## Sharing Your Work

| Method | How It Works |
|--------|--------------|
| **Share via URL** | Copy the URL from your browser - filters are automatically encoded |
| **Filter Presets** | Save named presets that others can load if they have access |
| **Export Presets** | Export preset JSON file to share with team members |

## Understanding the Interface

### Active Filters Bar
Located at the top of the explorer:
- Shows all currently applied filters
- Color-coded by source table
- Displays filter logic (Equals, OR, Range, NOT)
- Click **×** to remove individual filters
- Click **Clear All** to reset everything

### Table Headers
Each table section shows:
- **Table name** with unique color
- **Row count**: Current / Total (Percentage)
- **Direct filter badge**: Filters applied to this table
- **Linked filter badge**: Filters from related tables (with hop count)

### Row Count Display
- **"234 / 1,500 rows (15.6%)"** means:
  - 234 rows match current filters
  - 1,500 total rows in table
  - Viewing 15.6% of the data

## Relationships

### How It Works
- Filtering one table automatically filters related tables
- Example: Filter Patients → Samples table updates automatically

### Filter Types
- **Direct**: Applied directly to a table (solid badge)
- **Propagated**: Applied through relationships (outlined badge with hop count)

### Multi-Hop Relationships
- Filters can propagate through multiple tables
- Example: Patients → Samples → Tests
- Badge shows hop count (e.g., "2 hops")

## Common Tasks

### Compare Two Groups
1. Apply filter for Group 1 (e.g., Gender = Male)
2. Note the distributions
3. Click **Clear All**
4. Apply filter for Group 2 (e.g., Gender = Female)
5. Compare the results

### Find Records in a Specific Range
1. Locate the numeric column's histogram
2. Drag to select the range you want
3. Or use From/To fields for precise values
4. View updated results in all visualizations

### Drill Down to Specific Subset
1. Start with broad filter (e.g., Year = 2023)
2. Add more specific filters (e.g., Age > 50)
3. Continue refining (e.g., Gender = Female)
4. Save as preset if you'll use it again

### Exclude Specific Values
1. Apply normal filter (e.g., click on value)
2. Click the **¬ button** next to the filter
3. Now shows everything EXCEPT that value

### Work with Many Categories
1. Toggle to **Table View** (button above chart)
2. Use sorting to find top categories
3. Scroll through the list
4. Click rows to filter

## Tips & Shortcuts

### Mouse Actions
- **Single click**: Apply filter
- **Multiple clicks**: Select multiple values (OR logic)
- **Drag** (histogram): Select range
- **Hover**: See detailed tooltips

### Visual Indicators
- **Darker colors**: Filtered/selected data
- **Border highlights**: Active filters
- **Color matching**: Connects filters to source tables
- **¬ symbol**: NOT operator (negation)

### Best Practices
- Start broad, then narrow down with more filters
- Check row counts to ensure filters aren't too restrictive
- Use table view for columns with many unique values
- Save common filter combinations as presets
- Share URLs to preserve exact filter states

## Filter Logic

### Combining Filters
- **Different columns**: Combined with AND (all must be true)
- **Same column**: Combined with OR (any can be true)
- **NOT operator**: Inverts the filter logic

### Examples
- `Age > 50 AND Gender = Male`: Both conditions must be true
- `Country = USA OR Country = Canada`: Either condition can be true
- `NOT Gender = Male`: Shows all records where gender is NOT male

## Getting Help

- **User Guide**: [USER_GUIDE.md](USER_GUIDE.md) - Comprehensive documentation
- **FAQ**: [FAQ.md](FAQ.md) - Common questions and answers
- **Support**: Contact your system administrator

---

**Quick Tip**: Bookmark this page for easy reference while working with BIAI!
