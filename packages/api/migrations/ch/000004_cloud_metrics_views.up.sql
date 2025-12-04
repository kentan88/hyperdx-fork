-- Create materialized view for cloud infrastructure metrics summary
-- This view aggregates cloud metrics for faster dashboard queries
CREATE MATERIALIZED VIEW IF NOT EXISTS default.cloud_metrics_summary
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(TimeUnix)
ORDER BY (cloud_provider, resource_type, MetricName, TimeUnix)
TTL TimeUnix + INTERVAL 90 DAY
AS SELECT
    TimeUnix,
    ResourceAttributes['cloud.provider'] as cloud_provider,
    ResourceAttributes['cloud.resource.type'] as resource_type,
    ResourceAttributes['cloud.resource.id'] as resource_id,
    ResourceAttributes['cloud.region'] as region,
    ResourceAttributes['service.name'] as service_name,
    MetricName,
    avg(Value) as avg_value,
    max(Value) as max_value,
    min(Value) as min_value,
    count() as count
FROM default.metrics_gauge
WHERE has(mapKeys(ResourceAttributes), 'cloud.provider')
  AND ResourceAttributes['cloud.provider'] IN ('aws', 'azure', 'gcp')
GROUP BY 
    TimeUnix, 
    cloud_provider, 
    resource_type, 
    resource_id, 
    region, 
    service_name,
    MetricName;
