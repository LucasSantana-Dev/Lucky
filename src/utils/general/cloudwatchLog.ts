import { CloudWatchLogsClient, PutLogEventsCommand, CreateLogGroupCommand, CreateLogStreamCommand, DescribeLogStreamsCommand, PutRetentionPolicyCommand } from "@aws-sdk/client-cloudwatch-logs";

const logGroupName = `/aws/ec2/${process.env.SERVICE_NAME || 'lukbot'}`;
const logStreamName = `${process.env.NODE_ENV || 'production'}-${new Date().toISOString().split('T')[0]}`;
const logsClient = new CloudWatchLogsClient({ region: "us-east-1" });

let logBuffer: any[] = [];
let bufferTimeout: NodeJS.Timeout | null = null;
const BATCH_SIZE = 10; // Send up to 10 logs at once
const BATCH_INTERVAL = 5000; // Send every 5 seconds if not full

async function ensureLogGroupAndStream() {
  try {
    await logsClient.send(new CreateLogGroupCommand({ logGroupName }));
  } catch {}
  try {
    await logsClient.send(new CreateLogStreamCommand({ logGroupName, logStreamName }));
  } catch {}
  // Set 7-day retention (idempotent)
  try {
    await logsClient.send(new PutRetentionPolicyCommand({ logGroupName, retentionInDays: 7 }));
  } catch {}
}

async function flushBuffer() {
  if (logBuffer.length === 0) return;
  await ensureLogGroupAndStream();
  // Get the next sequence token
  const streams = await logsClient.send(new DescribeLogStreamsCommand({ logGroupName, logStreamNamePrefix: logStreamName }));
  const sequenceToken = streams.logStreams?.[0]?.uploadSequenceToken;
  const command = new PutLogEventsCommand({
    logGroupName,
    logStreamName,
    logEvents: logBuffer,
    sequenceToken,
  });
  try {
    await logsClient.send(command);
  } catch (err) {
    console.error('Failed to send logs to CloudWatch:', err);
  }
  logBuffer = [];
}

export function logToCloudWatch(level: string, message: string, metadata: Record<string, any> = {}) {
  if (level !== 'ERROR') return; // Only send error logs for now
  logBuffer.push({
    message: JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...metadata
    }),
    timestamp: Date.now()
  });
  if (logBuffer.length >= BATCH_SIZE) {
    flushBuffer();
    if (bufferTimeout) clearTimeout(bufferTimeout);
    bufferTimeout = null;
  } else if (!bufferTimeout) {
    bufferTimeout = setTimeout(flushBuffer, BATCH_INTERVAL);
  }
} 