import { trace } from '@opentelemetry/api';
import { registerOTel } from '@vercel/otel';
import { setTracerProvider } from 'flags';

registerOTel({ serviceName: 'sveltekit-example' });

// flags reads this provider. registerOTel does not register it.
setTracerProvider(trace.getTracerProvider());
