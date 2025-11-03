# BIAI User Guide

Welcome to the BIAI (Business Intelligence AI) User Guide! This guide will help you understand how to use the web interface to explore, analyze, and visualize your data.

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Browsing Datasets](#browsing-datasets)
4. [Exploring Data](#exploring-data)
5. [Working with Dashboards](#working-with-dashboards)
6. [Understanding Visualizations](#understanding-visualizations)
7. [Filtering Data](#filtering-data)
8. [Working with Relationships](#working-with-relationships)
9. [Saving and Sharing](#saving-and-sharing)
10. [Tips and Best Practices](#tips-and-best-practices)

---

## Introduction

BIAI is a powerful data exploration and visualization tool that helps you analyze datasets with multiple related tables. Whether you're exploring clinical data, business metrics, or research datasets, BIAI provides an intuitive interface for:

- **Visualizing data distributions** with automatic chart selection
- **Interactive filtering** across multiple tables
- **Relationship-aware analysis** that connects related data
- **Saving and sharing** your analysis with others

## Getting Started

### Navigating the Interface

When you first open BIAI, you'll see the main navigation with several sections:

- **Datasets**: Browse all available datasets (this is your home page)
- **Dataset Explorer**: Interactive data exploration (opens when you select a dataset)

### Your First Steps

1. Start at the **Datasets** page to see what data is available
2. Click on a dataset to explore it
3. Use the interactive charts and filters to analyze your data
4. Save your filter combinations as presets for quick access later

---

## Browsing Datasets

### The Datasets Page

The Datasets page shows all available datasets with important information:

- **Dataset Name**: The title of the dataset
- **Description**: What the dataset contains (may include formatted text and links)
- **Tags**: Category labels for easy identification
- **Source**: Where the data comes from
- **Citation**: How to cite this dataset in your work
- **References**: Links to related publications (PubMed IDs and DOIs are automatically linked)
- **Tables**: Number of tables in the dataset
- **Last Updated**: When the dataset was last modified

### Finding the Right Dataset

- Look for datasets with **tags** that match your research area
- Read the **description** to understand what data is available
- Check the **table count** to see how complex the dataset is
- Review **references** to understand the data's scientific context

### Opening a Dataset

Click anywhere on a dataset card to open it in the **Dataset Explorer**.

---

## Exploring Data

### The Dataset Explorer Interface

Once you open a dataset, you'll see the main exploration interface:

**Header Section**
- Dataset name and description at the top
- Total record count across all tables
- **Edit button** (pencil icon) to access management features
- **Active filters bar** showing currently applied filters

**Table Sections**
Below the header, you'll see sections for each table in the dataset:
- Each table has a **color-coded header** for easy identification
- The header shows:
  - Table name
  - Current row count (filtered) vs. baseline count (unfiltered)
  - Percentage of rows after filtering
  - Number of active filters on this table

**Column Visualizations**
Within each table section, you'll see visualizations for each column:
- Charts or tables displaying the data distribution
- Filter controls for interactive analysis
- Real-time updates as you apply filters

### Understanding Table Colors

Each table has a unique color assigned to it:
- The **color bar** appears in the table header
- This color is used consistently throughout the interface
- When filtering affects multiple tables through relationships, you'll see multiple colors

### Row Count Indicators

The row count display helps you understand the impact of your filters:
- **"234 / 1,500 rows (15.6%)"** means:
  - 234 rows match your current filters
  - 1,500 rows in the original table
  - You're viewing 15.6% of the data

---

## Working with Dashboards

The Dashboard feature allows you to create personalized views by collecting your favorite charts from across all tables in one place.

### Understanding the Dashboard Tab

When you open a dataset, you'll notice the **Dashboard** tab is always the first tab:
- **Tab order**: `[Dashboard] [Table 1] [Table 2] [Table 3]...`
- The dashboard starts empty by default
- Charts you add appear here for quick access

### Adding Charts to Your Dashboard

To build your personalized dashboard:

**Add Individual Charts**
1. Navigate to any table tab
2. Find a chart you want to add
3. Click the **"+ Add to Dashboard"** button on the chart
4. The button changes to show a **checkmark (✓)** when added
5. Click again to remove from dashboard

**Add All Charts from a Table**
1. Navigate to the table tab you're interested in
2. Click the **"Add All Charts"** button in the table header
3. All visible charts from that table are added at once

**What Charts Can Be Added?**
- Pie charts (categorical data with ≤8 categories)
- Bar charts (categorical data with >8 categories)
- Histograms (numeric data)
- Table views (high-cardinality categorical data)

### Dashboard Display

Your dashboard shows all added charts in a clean, organized layout:

**Visual Features**
- **Color-coded borders**: Each chart has a border matching its source table color
- **Table context**: Chart titles show "**Table Name** - Column Name"
- **Same grid layout**: Uses the same 175px tile system as table tabs
- **Chronological order**: Charts appear in the order you added them

**Interactive Elements**
- **Hover effects**: Shows remove button (×) when you hover over a chart
- **Click to filter**: Dashboard charts are fully interactive—click to add filters
- **Live updates**: Charts update dynamically as you apply filters
- **Remove button**: Click the × to remove individual charts

### Managing Your Dashboard

**Clear Dashboard**
- Click the **"Clear Dashboard"** button to remove all charts at once
- Useful when starting a new analysis or resetting your view

**Dashboard Count**
- The tab label shows the number of charts: `Dashboard (5)`
- Helps you track how many charts you've added

### Saved Dashboards

Create and manage multiple dashboard configurations for different analyses:

**Saving a Dashboard**
1. Add charts to your dashboard as desired
2. Click the **"Save Dashboard"** button
3. Enter a descriptive name (e.g., "Patient Demographics", "Q4 Analysis")
4. Click Save
5. Your dashboard configuration is saved to the database

**Loading a Saved Dashboard**
1. Click the **"Load Dashboard"** dropdown
2. Select from your list of saved dashboards
3. The dashboard instantly updates with those charts

**Managing Saved Dashboards**
1. Click the **"Manage"** button
2. From the management dialog you can:
   - **Rename** dashboards by clicking the edit icon
   - **Delete** dashboards you no longer need
   - **View** when each dashboard was created and last updated

**The "Most Recent" Dashboard**
- Your current working dashboard is automatically saved as "Most Recent"
- This happens in the background—no action needed
- When you return, your dashboard is restored automatically
- This is separate from your saved dashboards

### Dashboard and Filters

Dashboards work seamlessly with the filtering system:

**Live Filter Updates**
- Dashboard charts update automatically when you apply filters
- The filter count badge shows on the dashboard tab
- Example: `Dashboard (5) [3 filters active]`

**Interactive Filtering from Dashboard**
- Click on any dashboard chart element to add a filter
- The filter applies across all charts and tables
- Works exactly like filtering from table tabs

**Cross-Table Context**
- Dashboard charts from different tables all respect relationships
- When you filter one table, related dashboard charts update
- Color-coded borders help you identify which table each chart comes from

### Dashboard Persistence

Your dashboards are saved automatically and sync across devices:

**Automatic Saving**
- Changes to "Most Recent" are saved to the database in real-time
- Saved dashboards persist across browser sessions
- Works even if you close the browser or switch devices

**Cross-Device Sync**
- Dashboards are stored in the database, not your browser
- Open the same dataset on another computer—your dashboards are there
- Perfect for working across multiple locations or devices

**Migration from Browser Storage**
- If you previously used dashboards, they're automatically migrated to the database
- This happens once, transparently, the first time you load a dataset
- Old browser-stored dashboards are removed after successful migration

### Dashboard Best Practices

**Organize by Purpose**
- Create different saved dashboards for different types of analysis
- Examples: "Overview", "Demographics Only", "Temporal Analysis"
- Use descriptive names that explain what the dashboard shows

**Start Simple**
- Begin with 3-5 key charts that answer your main questions
- Add more charts as you identify specific areas of interest
- Remember: you can always add or remove charts easily

**Combine with Filters**
- Use dashboards to organize your view
- Use filters to focus on specific data subsets
- Together, they create powerful, reusable analysis templates

**Share Your Insights**
- Saved dashboards help standardize team analyses
- Everyone can load the same dashboard for consistent views
- Combine with URL-based filter sharing for complete reproducibility

---

## Understanding Visualizations

BIAI automatically selects the best visualization type for each column based on the data.

### Automatic Chart Selection

**For Categorical Data (categories/text values):**
- **8 or fewer categories**: Pie chart (default)
- **More than 8 categories**: Bar chart or table view

**For Numeric Data (numbers):**
- **Histogram**: Shows the distribution of values across automatically calculated bins

### Visualization Types

#### Pie Charts
Best for categorical data with few categories:
- Each slice represents one category
- Shows percentage labels
- Click on a slice to filter for that category
- Great for seeing proportions at a glance

#### Bar Charts
Best for categorical data with many categories:
- Each bar represents one category
- Height shows the count of records
- Hover over bars to see exact counts
- Click on bars to filter
- X-axis labels are rotated for readability

#### Histograms
Best for numeric data to see distribution:
- Automatically calculates bin widths
- Shows how values are distributed
- Drag to select a range of values
- Darker bars indicate filtered data
- Shows both filtered and total counts

#### Table View
Best for high-cardinality categorical data (many unique values):
- Shows category, count, and percentage in columns
- Sorted by count (most common first)
- Displays top 100 categories
- Scrollable for long lists
- Click on rows to filter

### Switching Between Views

For categorical columns, you can toggle between chart and table views:

1. Look for the **view toggle button** above each visualization
2. Click to switch between chart and table
3. Your preference is saved automatically
4. Table view is particularly useful when you have many categories

### Interactive Features

All visualizations are interactive:
- **Click** on chart elements (slices, bars, rows) to filter
- **Hover** over elements to see details
- **Drag** on histograms to select ranges
- Changes update all visualizations in real-time

---

## Filtering Data

Filtering is the most powerful feature in BIAI, allowing you to narrow down your data to specific subsets for analysis.

### How Filtering Works

When you click on a chart element or table row:
1. A filter is applied to that column
2. All visualizations update to reflect the filtered data
3. Row counts change across all tables
4. The filter appears in the **Active Filters bar** at the top

### Types of Filters

#### Single Value Filter (Equality)
Click once on a category to filter for just that value:
- Example: Click on "Male" in a gender chart
- Shows only records where gender = Male

#### Multiple Value Filter (OR Logic)
Click multiple values in the same column:
- Example: Click "Male" then "Female" in a gender chart
- Shows records where gender = Male OR Female
- Useful for comparing specific groups

#### NOT Filter (Exclusion)
Exclude specific values using the NOT operator:
1. Click on the **¬ button** next to a filter
2. The filter becomes inverted
3. Example: NOT Male shows all records except Male

#### Range Filter (Numeric)
Select ranges of numeric values:
1. **Drag** on a histogram to select bins
2. Or use the **From/To inputs** for precise ranges
3. Example: Age from 40 to 60
4. Can select multiple ranges (combined with OR)

### The Active Filters Bar

At the top of the explorer, the Active Filters bar shows all current filters:

**Filter Display**
- **Color-coded** by source table
- Shows column name and table context
- Displays logic type (Equals, OR, Range)
- Shows value preview (truncated if many values)

**Filter Actions**
- **× button**: Remove individual filter
- **Clear All button**: Remove all filters at once
- **NOT indicator (¬)**: Shows negated filters

**Filter Logic**
- Multiple filters are combined with **AND** logic
- Example: "Age > 50 AND Gender = Female" shows only females over 50

### Categorical Filtering

When you click on a categorical column (text data):

1. A **filter menu** appears showing all unique values
2. Each value shows:
   - The category name
   - Count of records
   - Percentage of total
3. Click values to select them (multiple selection with OR logic)
4. Search box helps find specific values
5. Null values are shown as "(null)"

### Numeric Range Filtering

When you filter numeric columns:

1. You'll see a **histogram** showing value distribution
2. **Drag** to select bins visually
3. Or use **From/To fields** for exact ranges
4. **Statistics panel** shows:
   - Minimum and Maximum values
   - Median (50th percentile)
   - Q25 and Q75 (25th and 75th percentiles)
   - Standard deviation

### Resetting Filters

To remove filters:
- **Single filter**: Click the × on the filter in the Active Filters bar
- **Column reset**: Click the **Reset button** on the column visualization
- **All filters**: Click **Clear All** in the Active Filters bar

---

## Working with Relationships

One of BIAI's most powerful features is relationship-aware filtering across multiple tables.

### What Are Table Relationships?

In multi-table datasets, tables are often connected:
- Example: A "Patients" table and a "Samples" table
- Each sample belongs to one patient
- This is a **foreign key relationship**

### How Relationships Work in BIAI

When you filter one table, related tables are automatically filtered:

**Example Workflow:**
1. You filter the Patients table for "Age > 50"
2. The Samples table automatically shows only samples from those patients
3. Any other related tables also update

### Direct vs. Propagated Filters

BIAI shows two types of filters:

**Direct Filters** (applied directly to a table)
- You clicked on that table's visualizations
- Shown with a **solid badge** on the table header

**Propagated Filters** (applied through relationships)
- Automatically applied based on filters on related tables
- Shown with an **outlined badge** on the table header
- Shows the "hop count" (how many relationships away)

### Multi-Hop Relationships

BIAI supports transitive relationships (multiple hops):
- Example: Patients → Samples → Tests
- Filter Patients, and Tests are automatically filtered through Samples
- The **hop count badge** shows the distance (e.g., "2 hops")

### Filter Badges

Table headers show filter information:
- **Direct filter badge**: Number of filters applied directly
- **Linked filter badge**: Number of propagated filters with hop count
- **Color indicators**: Match the source table colors

### Understanding Filter Impact

The row counts help you understand relationship filtering:
- **Before filtering**: Samples table shows 1,500 rows
- **After filtering patients**: Samples table shows 230 rows
- The reduction comes from the patient filter propagating through the relationship

---

## Saving and Sharing

### Filter Presets

Save your commonly used filter combinations as presets for quick access.

#### Creating a Preset

1. Apply the filters you want to save
2. Click the **Filter Presets** button (above the visualizations)
3. Enter a name for your preset (e.g., "Elderly Patients", "High Risk Group")
4. Click **Save**

#### Loading a Preset

1. Click the **Filter Presets** dropdown
2. Select the preset you want to load
3. All filters are applied instantly

#### Managing Presets

Click **Manage Presets** to:
- **Rename** presets by clicking the edit icon
- **Delete** presets you no longer need
- **Export** all presets to a JSON file (for backup)
- **Import** presets from a JSON file (to restore or share)

### Sharing Your Analysis via URL

BIAI automatically saves your filters in the URL, making it easy to share:

1. Apply your filters as desired
2. Copy the **URL from your browser's address bar**
3. Share the URL with colleagues
4. When they open it, they'll see the same filters applied

**Note**: URL-based filters persist even if you close and reopen the browser.

### Persistent State

BIAI automatically saves your work:
- **Active filters**: Saved to localStorage and URL
- **View preferences**: Whether you chose chart or table view
- **Filter presets**: Stored per dataset in localStorage
- **Dashboards**: Saved to database and synced across devices
- **URL state**: Current filters encoded in the URL

This means you can:
- Close the browser and come back later
- Refresh the page without losing your work
- Share URLs to preserve exact filter states
- Access your dashboards from any device

---

## Tips and Best Practices

### Effective Data Exploration

**Start Broad, Then Narrow**
1. Begin by exploring the overall distribution of each column
2. Identify interesting patterns or outliers
3. Apply filters to focus on specific subsets
4. Use multiple filters to refine your analysis

**Use Table View for High-Cardinality Data**
- When a categorical column has many values (>8), table view is more useful
- Sort by count to see the most common values
- Use the search feature to find specific categories

**Leverage Relationships**
- Start by filtering the "primary" table (e.g., Patients)
- Watch how related tables automatically update
- This ensures your analysis is consistent across all tables

**Save Your Work**
- Create presets for common filter combinations
- Use descriptive names like "Active Adult Patients" or "2023 Q1 Data"
- Export presets regularly as a backup

### Understanding Your Data

**Check Row Counts**
- Always look at the row count after filtering
- If you see 0 rows, your filters may be too restrictive
- The percentage helps you understand how selective your filters are

**Pay Attention to Filter Logic**
- Multiple filters on different columns use AND logic (all must be true)
- Multiple values in the same column use OR logic (any can be true)
- Use the NOT operator to exclude rather than include

**Use Statistics for Numeric Data**
- The statistics panel shows median, quartiles, and standard deviation
- These help you understand the distribution
- Use them to set meaningful range filters

### Working with Complex Datasets

**Multi-Table Filtering**
- Start with the most specific filters first
- Watch the hop count badges to understand filter propagation
- Remember that propagated filters show you related data, not the filtered table itself

**Large Categories**
- When you have hundreds of unique values, use table view
- Focus on the top categories first
- Consider whether you need to filter by this column at all

**Sharing and Collaboration**
- Always use URL sharing for precise filter states
- Include a description of what the filters show
- Consider creating presets for common team analyses

### Common Workflows

**Comparing Groups**
1. Filter for the first group (e.g., Age > 65)
2. Note the distributions in visualizations
3. Clear filters
4. Filter for the second group (e.g., Age < 30)
5. Compare the patterns

**Finding Outliers**
1. Look at histogram distributions for numeric data
2. Use range filters to isolate extreme values
3. Apply filters to understand what's common in those outliers

**Drilling Down**
1. Start with high-level filters (e.g., Year = 2023)
2. Add more specific filters (e.g., Region = West)
3. Continue refining until you find the subset you're interested in
4. Save as a preset if you'll use it again

### Keyboard and Mouse Tips

**Mouse Interactions**
- **Single click**: Apply filter or select value
- **Drag** (on histograms): Select a range of values
- **Hover**: See detailed tooltips with counts
- **Multiple clicks**: Select multiple values (OR logic)

**Visual Feedback**
- **Darker colors**: Indicate filtered/selected data
- **Border highlights**: Show active filters
- **Color matching**: Connects filters to their source tables

---

## Need Help?

If you encounter any issues or have questions:

1. Check the [Quick Reference](QUICK_REFERENCE.md) for common tasks
2. Review the [FAQ](FAQ.md) for answers to common questions
3. Contact your system administrator if the application isn't working as expected

---

**Happy Exploring!**

BIAI is designed to make data exploration intuitive and powerful. The more you use it, the more patterns and insights you'll discover in your data.
