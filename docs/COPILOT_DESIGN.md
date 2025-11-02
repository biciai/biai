# BIAI Co-Pilot Chat Design

## Overview

A conversational AI assistant integrated into the Dataset Explorer that helps users explore, filter, and analyze data through natural language interactions.

---

## Table of Contents

1. [Goals and Use Cases](#goals-and-use-cases)
2. [UI Design](#ui-design)
3. [Core Capabilities](#core-capabilities)
4. [Conversation Patterns](#conversation-patterns)
5. [Technical Architecture](#technical-architecture)
6. [User Experience Flows](#user-experience-flows)
7. [Implementation Phases](#implementation-phases)
8. [Open Questions](#open-questions)

---

## Goals and Use Cases

### Primary Goals

1. **Lower Barrier to Entry**: Enable non-technical users to explore data using natural language
2. **Increase Discovery**: Help users find insights they might not have discovered manually
3. **Accelerate Analysis**: Speed up common filtering and exploration tasks
4. **Teach the Interface**: Guide users to learn BIAI's features through conversation

### Key Use Cases

#### Beginner Use Cases
- "Show me all patients over 65 years old"
- "What's the gender distribution in this dataset?"
- "Filter for samples from female patients with stage III cancer"
- "How many records are there in total?"

#### Intermediate Use Cases
- "Compare the age distribution between male and female patients"
- "Show me outliers in the age column"
- "Find patients with high BMI and diabetes"
- "What are the top 5 most common cancer types?"

#### Advanced Use Cases
- "Show me samples where the patient age is above the median and the tumor grade is high"
- "Find correlations between age and survival time"
- "Create a filter for the 25th to 75th percentile of age"
- "Show me all samples from patients diagnosed between 2010 and 2015"

#### Discovery Use Cases
- "What patterns can you find in this data?"
- "What's interesting about the patients with the longest survival time?"
- "Suggest some analyses I could run on this dataset"
- "What columns should I look at first?"

---

## UI Design

### Layout Option 1: Sidebar Panel (Recommended)

**Placement**: Right-side collapsible panel

```
┌─────────────────────────────────────────────┬──────────────┐
│ Dataset Header                              │   [≡] Chat   │
│ Active Filters Bar                          │              │
├─────────────────────────────────────────────┤              │
│                                             │              │
│  Table: Patients                            │  Chat        │
│  ┌────────┐ ┌────────┐ ┌────────┐         │  Messages    │
│  │Chart 1 │ │Chart 2 │ │Chart 3 │         │  Area        │
│  └────────┘ └────────┘ └────────┘         │              │
│                                             │              │
│  Table: Samples                             │              │
│  ┌────────┐ ┌────────┐                     │              │
│  │Chart 4 │ │Chart 5 │                     │              │
│  └────────┘ └────────┘                     ├──────────────┤
│                                             │ [Input Box]  │
│                                             │ [Send]       │
└─────────────────────────────────────────────┴──────────────┘
```

**Specifications**:
- Width: 400-500px when expanded
- Collapsible with animation
- Persistent state (open/closed) saved to localStorage
- Floating toggle button when collapsed
- Semi-transparent overlay option when expanded (mobile)

**Pros**:
- Doesn't interfere with main content
- Easy to toggle on/off
- Familiar pattern (similar to developer tools, chat apps)
- Can show while scrolling through data

**Cons**:
- Reduces horizontal space for charts
- May feel disconnected from the data

---

### Layout Option 2: Bottom Drawer

**Placement**: Bottom-anchored drawer that slides up

```
┌─────────────────────────────────────────────────────────┐
│ Dataset Header                          [↑] Show Co-Pilot│
│ Active Filters Bar                                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Table: Patients                                         │
│  ┌────────┐ ┌────────┐ ┌────────┐                      │
│  │Chart 1 │ │Chart 2 │ │Chart 3 │                      │
│  └────────┘ └────────┘ └────────┘                      │
│                                                          │
├══════════════════════════════════════════════════════════┤
│ Co-Pilot Chat                                  [↓] Close │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Chat messages...                                   │  │
│ └────────────────────────────────────────────────────┘  │
│ [Input box]                                    [Send]    │
└─────────────────────────────────────────────────────────┘
```

**Specifications**:
- Height: 300-400px when expanded, adjustable
- Resize handle for custom height
- Minimized shows only input bar (compact mode)

**Pros**:
- Doesn't reduce horizontal space for charts
- More integrated feel with the data
- Input always visible (in compact mode)

**Cons**:
- Reduces vertical space for data
- May obscure charts when expanded

---

### Layout Option 3: Floating Chat Widget

**Placement**: Bottom-right floating widget (like customer support chat)

```
┌─────────────────────────────────────────────────────────┐
│ Dataset Header                                           │
│ Active Filters Bar                                       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Table: Patients                                         │
│  ┌────────┐ ┌────────┐ ┌────────┐                      │
│  │Chart 1 │ │Chart 2 │ │Chart 3 │                      │
│  └────────┘ └────────┘ └────────┘                      │
│                                                          │
│  Table: Samples                                          │
│  ┌────────┐ ┌────────┐            ┌─────────────────┐  │
│  │Chart 4 │ │Chart 5 │            │ Co-Pilot        │  │
│  └────────┘ └────────┘            │ Messages...     │  │
│                                    │                 │  │
│                                    │ [Input] [Send]  │  │
│                                    └─────────────────┘  │
│                                           [💬] Toggle   │
└─────────────────────────────────────────────────────────┘
```

**Specifications**:
- Fixed position, draggable
- Width: 350-400px
- Minimizes to icon button

**Pros**:
- Familiar UX pattern
- Always accessible
- Doesn't interfere with layout

**Cons**:
- May obscure content
- Less integrated feel
- Can feel "bolted on"

---

### Recommended: **Sidebar Panel** with these features:

1. **Toggle Button**: Prominent "AI Co-Pilot" button in header
2. **Keyboard Shortcut**: `Cmd/Ctrl + K` to open/close
3. **Smart Positioning**: Slides in from right, pushes content left (no overlay)
4. **Responsive**: Becomes bottom drawer on mobile
5. **State Persistence**: Remembers open/closed state

---

## Core Capabilities

### 1. Natural Language Filtering

**What it does**: Translates natural language queries into filter objects

**Examples**:
```
User: "Show me patients older than 60"
→ Applies filter: { column: "age", operator: "gt", value: 60 }

User: "Filter for female patients with stage 3 or stage 4 cancer"
→ Applies filters:
  AND [
    { column: "gender", operator: "eq", value: "Female" },
    { column: "stage", operator: "in", value: ["3", "4"] }
  ]

User: "Exclude patients from Europe"
→ Applies filter: { not: { column: "region", operator: "eq", value: "Europe" } }
```

**Implementation**:
- Parse user intent using LLM
- Extract column names, operators, values
- Validate against dataset schema
- Apply filters using existing filter logic

---

### 2. Data Summarization

**What it does**: Answers questions about current data state

**Examples**:
```
User: "How many patients are in this dataset?"
→ "There are 1,523 patients in the Patients table."

User: "What's the age range?"
→ "The age ranges from 18 to 89 years, with a median of 56."

User: "What are the most common cancer types?"
→ "The top 3 cancer types are:
   1. Lung Cancer (342 patients, 22.4%)
   2. Breast Cancer (289 patients, 19.0%)
   3. Colon Cancer (234 patients, 15.4%)"
```

**Implementation**:
- Use existing aggregation data
- Format responses conversationally
- Include context from column metadata

---

### 3. Guided Exploration

**What it does**: Suggests analyses and insights

**Examples**:
```
User: "What should I look at first?"
→ "Here are some interesting starting points:
   - The age distribution shows two distinct peaks
   - 15% of records have null values in the 'stage' column
   - The gender split is 58% female, 42% male

   Would you like me to show you any of these?"

User: "Find interesting patterns"
→ "I noticed that:
   - Patients over 70 have a 2.3x higher rate of Stage IV diagnosis
   - The survival time distribution is heavily right-skewed
   - There's a cluster of 23 patients with unusually high BMI values

   Would you like to explore any of these patterns?"
```

**Implementation**:
- Analyze aggregations for patterns
- Detect outliers, distributions, correlations
- Use LLM to generate natural language insights

---

### 4. Comparative Analysis

**What it does**: Helps compare groups or time periods

**Examples**:
```
User: "Compare male and female patients"
→ "Let me compare gender groups:

   Male patients (642):
   - Average age: 58.3 years
   - Stage IV: 18.2%

   Female patients (881):
   - Average age: 54.1 years
   - Stage IV: 14.7%

   Would you like to see a visualization?"

User: "How has the diagnosis rate changed over time?"
→ [Analyzes diagnosis_date column and shows trends]
```

**Implementation**:
- Create comparison groups automatically
- Calculate summary statistics
- Present side-by-side comparisons

---

### 5. Filter Management

**What it does**: Helps create, modify, and save filters

**Examples**:
```
User: "Save this as 'High Risk Patients'"
→ "Saved current filters as preset 'High Risk Patients'. You can load it anytime from the Filter Presets menu."

User: "Add a filter for BMI over 30"
→ "Added filter: BMI > 30. Now showing 234 patients (15.4%)."

User: "Remove the age filter"
→ "Removed age filter. Now showing 892 patients (58.5%)."

User: "Clear all filters"
→ "Cleared all filters. Showing all 1,523 patients."
```

**Implementation**:
- Direct integration with filter state
- Support for preset creation/loading
- Clear filter modification commands

---

### 6. Context-Aware Help

**What it does**: Explains features and guides users

**Examples**:
```
User: "How do I filter for multiple values?"
→ "To filter for multiple values in the same column, just click multiple slices/bars in the chart, or ask me! For example: 'Show me stage 1, 2, and 3'"

User: "What does the hop count mean?"
→ "The hop count shows how filters propagate through relationships. For example, if you filter Patients, the Samples table shows '1 hop' because it's directly connected. Let me know if you'd like to see the relationship diagram!"

User: "What are filter presets?"
→ "Filter presets let you save combinations of filters with a name (like 'High Risk Group'). You can create them by clicking 'Filter Presets' → 'Save'. Want me to save your current filters?"
```

**Implementation**:
- Detect help/question patterns
- Pull from FAQ and User Guide
- Provide contextual examples

---

### 7. Relationship Navigation

**What it does**: Helps understand and utilize table relationships

**Examples**:
```
User: "What tables are related to Patients?"
→ "The Patients table is related to:
   - Samples (1-to-many via patient_id)
   - Clinical_Events (1-to-many via patient_id)

   Filtering Patients will automatically filter these related tables."

User: "Show me samples from patients over 60"
→ "I'll filter Patients for age > 60, which will automatically show only related samples. Applying now..."
```

**Implementation**:
- Visualize relationship graph
- Explain filter propagation
- Auto-navigate relationships in queries

---

## Conversation Patterns

### Pattern 1: Direct Command
```
User: "Show me patients over 65"
AI: "Applied filter: Age > 65. Now showing 342 patients (22.4%)."
```

### Pattern 2: Clarification
```
User: "Show me high BMI patients"
AI: "I can filter for BMI values. What threshold would you like?
    - BMI > 25 (overweight)
    - BMI > 30 (obese)
    - Custom value?"

User: "Over 30"
AI: "Applied filter: BMI > 30. Now showing 234 patients (15.4%)."
```

### Pattern 3: Suggestion
```
User: "What's interesting about this data?"
AI: "I found a few interesting patterns:
    1. Age distribution has two peaks (around 45 and 68)
    2. 15% of patients have Stage IV diagnosis
    3. BMI values show some outliers above 50

    Which would you like to explore?"

User: "The outliers"
AI: "Applied filter: BMI > 50. Found 12 patients. Looking at their data:
    - All are under 55 years old
    - 83% are male
    - Average survival: 18.2 months

    Shall I create a preset for this group?"
```

### Pattern 4: Multi-Step Analysis
```
User: "Find high-risk patients"
AI: "I'll help define high-risk patients. Which criteria matter most?
    - Age (e.g., > 70)
    - Stage (e.g., Stage III or IV)
    - Other clinical factors?"

User: "Stage 4 and age over 70"
AI: "Applied filters:
    - Stage = IV
    - Age > 70

    Found 47 patients (3.1%). Would you like me to:
    - Save this as a preset?
    - Compare with other age groups?
    - Show survival statistics?"

User: "Show survival statistics"
AI: "For these 47 high-risk patients:
    - Median survival: 14.2 months
    - Range: 2 to 56 months
    - 34% survived > 18 months

    Compare to overall population:
    - Median survival: 28.7 months (+101% higher)

    Would you like to see a visualization?"
```

### Pattern 5: Error Handling
```
User: "Show me patients with high blood pressure"
AI: "I don't see a 'blood_pressure' column in this dataset.
    Available cardiovascular-related columns are:
    - BMI
    - Diabetes (yes/no)

    Did you mean one of these?"

User: "Filter for patients before 2010"
AI: "I found a 'diagnosis_date' column. Did you mean:
    - Diagnosed before 2010?
    - First visit before 2010?

    Or were you looking for a different date column?"
```

---

## Technical Architecture

### Components

```
┌─────────────────────────────────────────────────────┐
│                     CopilotChat                      │
│  - Main chat component                              │
│  - Manages conversation state                       │
│  - Coordinates other components                     │
└────────────┬────────────────────────────────────────┘
             │
    ┌────────┼────────┬──────────────┬───────────────┐
    │        │        │              │               │
    ▼        ▼        ▼              ▼               ▼
┌─────┐ ┌─────┐ ┌──────────┐ ┌────────────┐ ┌──────────────┐
│Chat │ │Input│ │ Message  │ │ Suggested  │ │  Action      │
│Panel│ │Bar  │ │ List     │ │ Prompts    │ │  Buttons     │
└─────┘ └─────┘ └──────────┘ └────────────┘ └──────────────┘
```

### Data Flow

```
User Input
    ↓
Input Processing (parse intent)
    ↓
Intent Classification
    ├─→ Filter Query → Parse columns/operators/values → Apply filters
    ├─→ Summarization → Fetch aggregations → Format response
    ├─→ Comparison → Create groups → Calculate stats → Format
    ├─→ Help → Search docs → Format response
    └─→ Discovery → Analyze patterns → Generate insights
    ↓
Response Generation (LLM)
    ↓
Action Execution (optional: apply filters, save presets, etc.)
    ↓
Display Response + UI Updates
```

### API Integration Points

#### 1. LLM Service
```typescript
interface CopilotAPI {
  // Send message and get response
  sendMessage(params: {
    message: string
    context: ChatContext
    history: Message[]
  }): Promise<CopilotResponse>

  // Parse natural language filter
  parseFilter(params: {
    query: string
    schema: DatasetSchema
  }): Promise<FilterParseResult>

  // Generate insights
  generateInsights(params: {
    aggregations: Record<string, ColumnAggregation[]>
    filters: Filter[]
  }): Promise<Insight[]>
}
```

#### 2. Context Provider
```typescript
interface ChatContext {
  dataset: {
    id: string
    name: string
    description: string
    tables: Table[]
  }
  currentState: {
    filters: Filter[]
    activeTable: string | null
    rowCounts: Record<string, number>
  }
  aggregations: Record<string, ColumnAggregation[]>
  metadata: Record<string, ColumnMetadata[]>
}
```

#### 3. Action Handlers
```typescript
interface CopilotActions {
  applyFilter(filter: Filter): void
  removeFilter(filterIndex: number): void
  clearAllFilters(): void
  savePreset(name: string): void
  loadPreset(id: string): void
  highlightColumn(tableName: string, columnName: string): void
  scrollToTable(tableName: string): void
}
```

### Message Types

```typescript
type Message = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  actions?: Action[]  // Suggested actions
  metadata?: {
    filtersApplied?: Filter[]
    insightGenerated?: boolean
    errorOccurred?: boolean
  }
}

type Action = {
  type: 'apply_filter' | 'save_preset' | 'load_preset' | 'clear_filters' | 'view_docs'
  label: string
  data: any
}
```

### State Management

```typescript
interface CopilotState {
  isOpen: boolean
  messages: Message[]
  isLoading: boolean
  context: ChatContext
  suggestedPrompts: string[]
  conversationId: string
}
```

---

## User Experience Flows

### Flow 1: First-Time User

```
1. User opens dataset explorer
2. Co-pilot shows welcome message with suggested prompts:
   "👋 Hi! I'm your BIAI Co-Pilot. I can help you explore this dataset.

   Try asking me:
   • What's in this dataset?
   • Show me the age distribution
   • Filter for high-risk patients
   • What patterns can you find?"

3. User clicks: "What's in this dataset?"
4. Co-pilot responds with overview:
   "This dataset contains clinical data for 1,523 patients with:

   📊 Tables:
   - Patients: 1,523 records (demographics, diagnosis)
   - Samples: 4,892 records (tissue samples)
   - Clinical Events: 12,384 records (treatments, outcomes)

   🔗 Relationships:
   - Each patient can have multiple samples and clinical events

   💡 Key columns to explore:
   - Age, Gender, Stage (in Patients)
   - Sample Type, Tumor Grade (in Samples)
   - Event Type, Survival Time (in Clinical Events)

   What would you like to explore first?"

5. User interaction continues...
```

### Flow 2: Apply Natural Language Filter

```
1. User types: "Show me female patients over 60 with stage 3 cancer"

2. Co-pilot processes and shows confirmation:
   "I'll apply these filters:
   ✓ Gender = Female
   ✓ Age > 60
   ✓ Stage = 3

   [Apply Filters] [Cancel]"

3. User clicks "Apply Filters"

4. Filters are applied to the explorer
5. Co-pilot responds:
   "✅ Filters applied!

   Found 89 patients (5.8% of total)

   Quick stats:
   - Average age: 68.2 years
   - Age range: 61-84
   - Most common cancer: Breast (34%)

   💡 Suggestions:
   • Compare with other stages
   • Look at survival outcomes
   • Save as 'High Risk Women 60+'"

6. User can continue refining or exploring
```

### Flow 3: Pattern Discovery

```
1. User types: "Find interesting patterns in survival data"

2. Co-pilot analyzes and responds:
   "🔍 Analyzing survival patterns...

   Found 3 interesting insights:

   1. 📈 Age correlation
      - Patients < 50: median survival 42 months
      - Patients 50-70: median survival 28 months
      - Patients > 70: median survival 18 months
      [Filter each group]

   2. ⚠️ Stage impact
      - Stage I-II: 85% survive > 24 months
      - Stage III-IV: 32% survive > 24 months
      [View details]

   3. 🎯 Outlier group
      - 23 patients with survival > 80 months
      - All diagnosed at Stage I or II
      - Average age: 47 years
      [Show this group]

   Which insight would you like to explore?"

3. User clicks: [Show this group]

4. Filters applied, co-pilot responds:
   "✅ Showing the 23 long-survival patients

   Additional patterns in this group:
   - 91% are female
   - 78% had no prior conditions
   - 100% received treatment within 30 days

   Would you like to save this as a preset?"
```

### Flow 4: Comparison Analysis

```
1. User types: "Compare survival between male and female patients"

2. Co-pilot creates comparison:
   "📊 Gender Comparison - Survival Time

   👨 Male Patients (642):
   - Median survival: 24.3 months
   - Mean survival: 28.7 months
   - Range: 1-92 months
   - % surviving > 36 months: 38%

   👩 Female Patients (881):
   - Median survival: 31.2 months (+28%)
   - Mean survival: 34.1 months (+19%)
   - Range: 2-104 months
   - % surviving > 36 months: 52% (+37%)

   📈 Key findings:
   - Female patients show 28% longer median survival
   - Female patients have wider range (suggests more variability)
   - Significantly more females survive beyond 3 years

   💡 Next steps:
   • Break down by age groups
   • Check if stage distribution differs
   • Filter for long survivors only

   What would you like to explore next?"
```

---

## Implementation Phases

### Phase 1: Foundation (MVP)
**Goal**: Basic chat interface with filtering capabilities

**Features**:
- Chat UI (sidebar panel)
- Basic message exchange
- Natural language filter parsing
- Filter application
- Simple summarization (row counts, basic stats)

**Technical**:
- CopilotChat component
- LLM API integration (OpenAI/Anthropic)
- Context extraction from explorer state
- Filter parsing and application

**Success Criteria**:
- Users can ask "Show me patients over 60" and see filters applied
- Chat remembers conversation context
- Basic stats are provided on request

---

### Phase 2: Intelligence (Enhanced)
**Goal**: Add insights and suggestions

**Features**:
- Pattern detection and insights
- Suggested prompts
- Comparison analysis
- Error handling and clarifications
- Help and documentation lookup

**Technical**:
- Statistical analysis algorithms
- Insight generation logic
- Prompt suggestion engine
- FAQ/docs integration

**Success Criteria**:
- Co-pilot can suggest interesting analyses
- Comparisons work smoothly
- Users get helpful error messages

---

### Phase 3: Advanced (Full-Featured)
**Goal**: Complete co-pilot experience

**Features**:
- Filter preset management via chat
- Multi-step workflows
- Relationship navigation
- Export and sharing via chat
- Voice input (optional)
- Visualization recommendations

**Technical**:
- Advanced NLP for complex queries
- Workflow state machine
- Relationship graph visualization
- Speech-to-text integration

**Success Criteria**:
- Users can complete complex analyses via chat alone
- Co-pilot proactively suggests next steps
- Seamless integration with all explorer features

---

### Phase 4: Learning (Future)
**Goal**: Personalized and adaptive experience

**Features**:
- Learning from user patterns
- Personalized suggestions
- Dataset-specific insights
- Custom workflow templates
- Team collaboration features

**Technical**:
- Usage analytics
- Recommendation engine
- User preference learning
- Multi-user context

**Success Criteria**:
- Co-pilot adapts to user's analysis style
- Suggestions become more relevant over time
- Team members can share insights

---

## Open Questions

### UX Questions
1. **Persistence**: Should chat history persist across sessions?
   - Pro: Users can reference past analyses
   - Con: May accumulate clutter
   - Suggestion: Persist for 7 days with clear option

2. **Proactivity**: Should co-pilot offer unsolicited insights?
   - Pro: Helps discovery
   - Con: May be distracting
   - Suggestion: Opt-in "Auto-insights" mode

3. **Confirmation**: Require confirmation before applying filters?
   - Pro: Prevents unintended changes
   - Con: Slows interaction
   - Suggestion: Confirm only for destructive actions (clear all)

4. **Multi-modal**: Support voice input?
   - Pro: Hands-free, accessibility
   - Con: Privacy, accuracy issues
   - Suggestion: Phase 3 feature, opt-in

### Technical Questions
1. **LLM Provider**: Which LLM to use?
   - Options: OpenAI GPT-4, Anthropic Claude, Open-source (Llama)
   - Considerations: Cost, latency, privacy, capabilities
   - Suggestion: Start with OpenAI, allow provider switching

2. **Context Window**: How much context to send?
   - Full dataset schema + all aggregations = large payload
   - Optimization: Send only relevant tables/columns
   - Streaming: Use streaming for long responses

3. **Offline Mode**: Should co-pilot work without internet?
   - Limited functionality with local models?
   - Fallback to rule-based parsing?
   - Suggestion: Phase 4 consideration

4. **Rate Limiting**: How to handle API costs?
   - Per-user limits?
   - Caching common queries?
   - Suggestion: Implement query caching + rate limiting

### Product Questions
1. **Free vs Paid**: Should co-pilot be a premium feature?
   - Free tier: Limited queries/day
   - Paid tier: Unlimited + advanced features

2. **Privacy**: How to handle sensitive data?
   - Send only metadata, not actual values?
   - Option to disable for sensitive datasets?
   - Self-hosted LLM option?

3. **Feedback Loop**: How to improve responses?
   - Thumbs up/down on messages?
   - Report issues?
   - Usage analytics?

---

## Next Steps

### To Move Forward

1. **Validate Concept**: Create clickable prototype or mockup
2. **User Research**: Interview potential users about use cases
3. **Technical Spike**: Test LLM filter parsing accuracy
4. **Cost Analysis**: Estimate API costs based on usage projections
5. **Choose Architecture**: Decide on UI layout and technical stack
6. **Build MVP**: Implement Phase 1 features
7. **Iterate**: Gather feedback and enhance

### Immediate Actions

- [ ] Review and discuss this design doc
- [ ] Choose UI layout (sidebar vs drawer vs floating)
- [ ] Select LLM provider and set up API access
- [ ] Create basic component structure
- [ ] Build filter parsing proof-of-concept
- [ ] Design conversation prompts and system instructions
- [ ] Set up state management for chat
- [ ] Implement basic message exchange

---

## Appendix: Example Prompts

### Getting Started
- "What's in this dataset?"
- "Show me an overview"
- "Help me get started"

### Filtering
- "Show me patients over 65"
- "Filter for female patients with stage 3 cancer"
- "Exclude European patients"
- "Find records between 2010 and 2015"
- "Show me the top 10% by age"

### Analysis
- "What's the age distribution?"
- "How many patients are there?"
- "What are the most common cancer types?"
- "Find outliers in BMI"
- "What's the median survival time?"

### Comparison
- "Compare male vs female patients"
- "Show differences between stage 1 and stage 4"
- "How does survival vary by age group?"

### Discovery
- "Find interesting patterns"
- "What's unusual about this data?"
- "Suggest some analyses"
- "What should I look at first?"

### Filter Management
- "Save this as 'High Risk Patients'"
- "Load my saved filters"
- "Clear all filters"
- "Remove the age filter"

### Help
- "How do I filter for multiple values?"
- "What does hop count mean?"
- "Show me the user guide"
- "How do relationships work?"

---

## Conclusion

This co-pilot chat design aims to make BIAI more accessible and powerful by adding natural language interaction. By starting with an MVP focused on filtering and gradually adding intelligence, we can deliver value quickly while building toward a comprehensive AI assistant for data exploration.

The key success factors are:
1. **Accuracy**: Correctly understanding and executing user intent
2. **Speed**: Fast response times with minimal latency
3. **Intelligence**: Providing genuinely helpful insights and suggestions
4. **Integration**: Seamless connection with existing UI and features
5. **Learnability**: Helping users understand and master BIAI's capabilities

With careful implementation and iteration based on user feedback, the co-pilot can become an indispensable part of the BIAI experience.
