# SLO Feature Implementation Comparison

## Overview
This document compares the current SLO implementation against the feature request from [GitHub Issue #1453](https://github.com/hyperdxio/hyperdx/issues/1453).

## Key Differences

### 1. Data Model Architecture

#### Feature Request Approach
- **Separate SLI and SLO models**: The request proposes distinct `ISLI` and `ISLO` models
  - SLI defines the per-event measurement (success/failure condition)
  - SLO references an SLI and adds target percentage, time window, and error budget tracking
- **Structured SLI definition**: Uses a structured `successCondition` object with field, operator, and value

#### Current Implementation
- **Combined model**: Single `ISLO` model that includes both SLI definition and SLO configuration
- **Flexible SLI definition**: Supports two modes:
  - **Builder Mode**: Uses `filter` + `goodCondition` (structured, similar to feature request)
  - **Raw SQL Mode**: Uses `numeratorQuery` + `denominatorQuery` (more flexible but less structured)
- **Direct service association**: `serviceName` field directly on SLO (not via SLI)

**Assessment**: ⚠️ **Trade-off decision** - Both approaches have merit:

**Current Approach (Combined) - Advantages:**
- ✅ Simpler data model - one less table/collection to manage
- ✅ More flexible - supports both structured builder mode AND raw SQL queries
- ✅ Better for most use cases - most SLOs are 1:1 with their SLI definition
- ✅ Less joins/queries needed - all data in one place
- ✅ Easier to understand for users - SLO creation is a single step

**Separate SLI/SLO Approach - Advantages:**
- ✅ Better aligns with SRE theory - SLI and SLO are conceptually different
- ✅ Reusability - one SLI could be reused by multiple SLOs (e.g., same availability SLI with different targets: 99.9% vs 99.99%)
- ✅ Clearer separation of concerns - measurement definition vs. target/goal
- ✅ Better for organizations with many SLOs sharing common SLIs
- ✅ More structured - enforces consistency in SLI definitions

**Recommendation**: 
- **Keep current approach** for now because:
  1. Most real-world SLOs are 1:1 with their SLI (reusability is rare)
  2. Current flexibility (raw SQL support) is valuable for complex cases
  3. Migration would be disruptive with limited benefit
- **Consider separation** if you find:
  - Multiple SLOs sharing identical SLI definitions
  - Need for SLI templates/catalog
  - Strong organizational preference for strict SRE model alignment

---

### 2. SLI Definition Structure

#### Feature Request
```typescript
successCondition: {
  field: string;
  operator: '<' | '<=' | '>' | '>=' | '==' | '!=' | 'exists';
  value: string | number | boolean;
}
```

#### Current Implementation
- **Builder Mode**: `goodCondition` as a ClickHouse expression string (e.g., `"SeverityNumber < 17"`)
- **Raw SQL Mode**: Full custom queries

**Assessment**: ⚠️ **Feature request approach is more structured** - Could add validation and UI consistency, but current approach is more flexible for complex conditions.

**Recommendation**: Consider adding a structured `successCondition` object as an **optional** alternative to `goodCondition` string, while keeping the string format for backward compatibility.

---

### 3. Error Budget Calculation

#### Feature Request
- Error budget calculated as: `(1 - targetPercentage/100) * totalEvents`
- Burn rate formula: `actual error rate / expected error rate`
- Burn rate of 1.0 = consuming budget evenly
- Burn rate of 2.0 = consuming twice as fast

#### Current Implementation
- Error budget calculated as: `(1 - targetValue/100) * timeWindowMs` (time-based, not event-based)
- Burn rate calculation: Currently returns error rate `(1 - num/den) * 100`, not true burn rate
- Status determination uses error budget remaining percentage

**Assessment**: ⚠️ **Feature request approach is more standard** - The burn rate formula in the feature request is the industry-standard definition. Current implementation calculates error rate, not burn rate.

**Recommendation**: ✅ **Adopt the burn rate formula** from the feature request:
```typescript
// True burn rate calculation
const expectedErrorRate = (1 - targetValue / 100);
const actualErrorRate = (1 - achieved / 100);
const burnRate = actualErrorRate / expectedErrorRate; // or 0 if expectedErrorRate is 0
```

---

### 4. Error Budget Tracking

#### Feature Request
- Error budget remaining (events and time)
- Budget burndown visualization
- Historical budget consumption

#### Current Implementation
- ✅ Error budget remaining (percentage) - calculated in `getSLOStatus()`
- ✅ Budget burndown visualization - via `getSLOBurnRate()` endpoint
- ⚠️ Historical budget consumption - partially supported via `slo_aggregates` table

**Assessment**: ✅ **Mostly implemented** - Current implementation has the core features, but could enhance historical tracking.

---

### 5. Burn Alerts

#### Feature Request
- Alert when error budget is depleting faster than expected
- Configurable burn rate thresholds
- Multiple alert severity levels based on burn rate
- Integration with existing alert channels (webhooks, Slack, PagerDuty, email)

#### Current Implementation
- ⚠️ `alertThreshold` field exists (percentage of error budget remaining)
- ❌ No actual alerting implementation
- ❌ No burn rate-based alerts
- ❌ No integration with alert system

**Assessment**: ❌ **Major gap** - This is a critical feature from the request that's not implemented.

**Recommendation**: ✅ **High priority to implement**:
1. Add burn rate calculation to SLO status
2. Add burn rate threshold configuration to SLO model
3. Integrate with existing alert system
4. Add background task to check burn rates and trigger alerts

---

### 6. SLO Dashboard & Visualization

#### Feature Request
- SLO list page with current status and error budget
- SLO detail page with:
  - Real-time compliance percentage
  - Error budget burndown chart
  - Burn rate over time
  - Recent violations with drill-down

#### Current Implementation
- ✅ SLO list page (`SLOPage.tsx`)
- ✅ SLO detail page (`SLODetailsPage.tsx`)
- ✅ Status cards with compliance percentage
- ✅ Burn rate chart (though shows error rate, not true burn rate)
- ✅ BubbleUp integration for drill-down

**Assessment**: ✅ **Well implemented** - UI features are present, just need to fix burn rate calculation.

---

### 7. Multi-Service SLOs

#### Feature Request
- Share error budget across multiple services
- Aggregate events from related services
- Support for up to 10 services per SLO

#### Current Implementation
- ❌ Single service per SLO (`serviceName` field is a string, not array)
- ❌ No multi-service aggregation

**Assessment**: ❌ **Not implemented** - This is a Phase 4 feature in the request.

**Recommendation**: ⚠️ **Low priority** - Can be added later if needed. Current single-service approach is simpler and covers most use cases.

---

### 8. SLO Tags

#### Feature Request
- Organize SLOs by team, project, or service
- Filter and group SLOs

#### Current Implementation
- ❌ No tags field
- ✅ Filtering by team (via `team` field)

**Assessment**: ⚠️ **Partially implemented** - Team-based filtering exists, but no custom tags.

**Recommendation**: ⚠️ **Medium priority** - Useful for organization but not critical. Can be added as enhancement.

---

### 9. SLO Reporting

#### Feature Request
- Weekly/monthly SLO reports
- Trend analysis

#### Current Implementation
- ❌ No reporting features
- ✅ Historical data available via `slo_aggregates` table

**Assessment**: ❌ **Not implemented** - Phase 4 feature.

**Recommendation**: ⚠️ **Low priority** - Can be added later based on user demand.

---

### 10. Background Tasks & Real-Time Computation

#### Feature Request
- Calculate SLO compliance periodically (every 1-5 minutes)
- **Real-time compliance percentage** (mentioned in dashboard requirements)
- Update burn rates
- Trigger burn alerts when thresholds exceeded
- Store historical SLO data for reporting

#### Current Implementation
- ✅ Background task exists (`RunSLOChecksTask`)
- ✅ Aggregates SLO metrics periodically (runs via cron, typically every minute)
- ✅ Stores historical data in `slo_aggregates` table
- ⚠️ **Status only computed from pre-aggregated data** - not real-time
- ⚠️ Comment in code: `// computeSLOStatusOnDemand REMOVED - no longer needed as we use aggregates`
- ✅ Burn rate calculation in background task (now implemented)
- ✅ Alert triggering (now implemented)

**Assessment**: ⚠️ **Trade-off: Batch vs Real-Time**

**Current Approach (Batch/Aggregated):**
- ✅ **Performance**: Fast queries from pre-aggregated data
- ✅ **Scalability**: Doesn't query raw events table on every status request
- ✅ **Cost**: Lower ClickHouse query load
- ⚠️ **Latency**: Status only updates when background job runs (typically 1-minute delay)
- ⚠️ **Freshness**: May be up to 1 minute behind real-time

**Real-Time Approach (On-Demand):**
- ✅ **Freshness**: Always shows current status
- ✅ **Immediate**: No waiting for background job
- ❌ **Performance**: Slower queries (scanning raw events table)
- ❌ **Cost**: Higher ClickHouse load (query on every status request)
- ❌ **Scalability**: May not scale well with many concurrent users

**Recommendation**: 
- **Hybrid approach**: Use aggregates for fast queries, but add on-demand computation option
- Add a query parameter `?realtime=true` to `getSLOStatus()` that computes from raw events
- Default to aggregates for performance, allow real-time when needed
- This gives best of both worlds: fast by default, real-time when requested

---

## Summary of Recommendations

### High Priority (Should Adopt)

1. **Fix Burn Rate Calculation** ⚠️
   - Current: Returns error rate `(1 - num/den) * 100`
   - Should be: `actualErrorRate / expectedErrorRate`
   - Impact: Critical for accurate SLO monitoring

2. **Implement Burn Alerts** ❌
   - Add burn rate threshold configuration
   - Integrate with existing alert system
   - Trigger alerts when burn rate exceeds thresholds
   - Impact: Critical feature for proactive SLO management

### Medium Priority (Consider Adopting)

3. **Add Structured SLI Condition** (Optional Enhancement)
   - Add optional `successCondition` object alongside `goodCondition` string
   - Provides better validation and UI consistency
   - Keep string format for backward compatibility

4. **Add SLO Tags** (Optional Enhancement)
   - Add `tags: string[]` field to SLO model
   - Enable filtering and grouping in UI
   - Low complexity, good UX improvement

### Low Priority (Future Enhancements)

5. **Multi-Service SLOs** - Phase 4 feature, can be added later if needed
6. **SLO Reporting** - Phase 4 feature, can be added later if needed

---

## Implementation Notes

### Current Strengths
- ✅ Flexible SLI definition (supports both structured and raw SQL)
- ✅ Efficient aggregation architecture (`slo_aggregates` table)
- ✅ BubbleUp integration for root cause analysis
- ✅ Good UI/UX with status cards and charts
- ✅ Background task infrastructure

### Areas for Improvement
- ⚠️ Burn rate calculation needs correction
- ❌ Burn alerts not implemented
- ⚠️ Error budget could be tracked in both events and time (currently only percentage)

---

## Conclusion

The current implementation covers **most of Phase 1 and Phase 3** from the feature request, with some gaps:

1. **Critical Gap**: Burn rate calculation is incorrect (shows error rate, not burn rate)
2. **Critical Gap**: Burn alerts are not implemented (Phase 2)
3. **Minor Gaps**: Tags, multi-service SLOs, reporting (Phase 4 features)

**Overall Assessment**: The current implementation is **solid and production-ready** for core SLO functionality, but should adopt:
- ✅ Fix burn rate calculation (high priority)
- ✅ Implement burn alerts (high priority)
- ⚠️ Consider adding tags (medium priority)

The current architecture is actually **more flexible** than the feature request in some ways (supporting raw SQL queries), which is a strength.

