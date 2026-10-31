import React, { useState, useEffect } from 'react';
import {
  getWizardStatus,
  wizardSetup,
  getProxyHealthSummary,
  getAIStatus,
  getProxies,
  startEngine,
} from '../services/api';

const STEPS = [
  { id: 'welcome', label: 'Welcome', icon: '🚀' },
  { id: 'proxies', label: 'Proxy Setup', icon: '🌐' },
  { id: 'evaluate', label: 'Evaluate', icon: '🔍' },
  { id: 'strategy', label: 'Strategy', icon: '⚖️' },
  { id: 'ai', label: 'AI Check', icon: '🤖' },
  { id: 'ready', label: 'Ready', icon: '✅' },
];

export default function Wizard() {
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [proxyCount, setProxyCount] = useState(0);
  const [aiAvailable, setAIAvailable] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const res = await getWizardStatus();
      setStatus(res.data);
      setProxyCount(res.data?.proxyCount || 0);
      setAIAvailable(res.data?.ai?.available || false);
    } catch (err) {
      console.error('Failed to load wizard status:', err);
    }
  };

  const handleAction = async (action, data = {}) => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await wizardSetup(action, data);
      setActionMessage({ type: 'success', message: res.data.message || 'Success!' });
      await loadStatus();
      if (action === 'fetch-webshare') {
        setProxyCount(res.data.proxiesLoaded || proxyCount);
      }
    } catch (err) {
      setActionMessage({ type: 'error', message: err.response?.data?.error || err.message });
    }
    setLoading(false);
  };

  const next = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep(currentStep + 1);
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center justify-center mb-8 flex-wrap gap-2">
        {STEPS.map((step, idx) => (
          <React.Fragment key={step.id}>
            <button
              onClick={() => setCurrentStep(idx)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                idx === currentStep
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : idx < currentStep
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              <span>{step.icon}</span>
              <span>{step.label}</span>
            </button>
            {idx < STEPS.length - 1 && (
              <div className={`w-8 h-px ${idx < currentStep ? 'bg-green-400' : 'bg-gray-300'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
        {currentStep === 0 && <WelcomeStep status={status} />}
        {currentStep === 1 && (
          <ProxyStep
            proxyCount={proxyCount}
            loading={loading}
            actionMessage={actionMessage}
            onAction={handleAction}
          />
        )}
        {currentStep === 2 && (
          <EvaluateStep
            loading={loading}
            actionMessage={actionMessage}
            onAction={handleAction}
            status={status}
          />
        )}
        {currentStep === 3 && (
          <StrategyStep
            loading={loading}
            actionMessage={actionMessage}
            onAction={handleAction}
            status={status}
          />
        )}
        {currentStep === 4 && (
          <AIStep aiAvailable={aiAvailable} loading={loading} actionMessage={actionMessage} onAction={handleAction} />
        )}
        {currentStep === 5 && <ReadyStep proxyCount={proxyCount} aiAvailable={aiAvailable} />}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <button
          onClick={prev}
          disabled={currentStep === 0 || loading}
          className="px-6 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
        >
          ← Previous
        </button>
        <div className="text-sm text-gray-500">Step {currentStep + 1} of {STEPS.length}</div>
        {currentStep < STEPS.length - 1 ? (
          <button
            onClick={next}
            disabled={loading}
            className="px-6 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={async () => {
              try { await startEngine('best-first'); } catch (e) {}
              window.location.href = '/';
            }}
            className="px-6 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
          >
            Start Engine 🚀
          </button>
        )}
      </div>
    </div>
  );
}

function WelcomeStep({ status }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to WebSense</h2>
      <p className="text-gray-600 mb-6">
        This wizard will guide you through setting up your stealth traffic engine in just a few minutes.
      </p>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-indigo-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-indigo-700">{status?.proxyCount || 0}</div>
          <div className="text-sm text-gray-600">Proxies Loaded</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-700">{status?.urlCount || 0}</div>
          <div className="text-sm text-gray-600">Target URLs</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-700">{status?.countries || 0}</div>
          <div className="text-sm text-gray-600">Countries</div>
        </div>
        <div className="bg-orange-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-orange-700">{status?.ai?.available ? '✅' : '❌'}</div>
          <div className="text-sm text-gray-600">AI Available</div>
        </div>
      </div>
      <div className="bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">What you'll do:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
          <li>Fetch proxies from Webshare API</li>
          <li>Evaluate proxy quality (speed, anonymity, safety)</li>
          <li>Choose a proxy selection strategy</li>
          <li>Check AI availability for smart recommendations</li>
        </ol>
      </div>
    </div>
  );
}

function ProxyStep({ proxyCount, loading, actionMessage, onAction }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Proxy Setup</h2>
      <p className="text-gray-600 mb-6">
        Fetch proxies from your Webshare account. You currently have <strong>{proxyCount}</strong> proxies loaded.
      </p>

      {actionMessage && (
        <div className={`rounded-lg p-4 mb-6 ${actionMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {actionMessage.message}
        </div>
      )}

      <div className="space-y-4 mb-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Webshare API</h3>
              <p className="text-sm text-gray-600">Fetch proxies directly from your Webshare account</p>
            </div>
            <button
              onClick={() => onAction('fetch-webshare')}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Fetching...' : 'Fetch Proxies'}
            </button>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-2">Webshare Download URL</h3>
          <p className="text-sm text-gray-600 mb-2">
            Use this URL to download proxies directly:
          </p>
          <code className="block bg-gray-900 text-green-400 text-xs p-3 rounded-lg overflow-x-auto">
            https://proxy.webshare.io/api/v2/proxy/list/download/...
          </code>
        </div>

        {proxyCount > 0 && (
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900 mb-2">✅ Proxies Loaded</h3>
            <p className="text-sm text-green-700">
              {proxyCount} proxies are available. Proceed to evaluation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function EvaluateStep({ loading, actionMessage, onAction, status }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Evaluate Proxies</h2>
      <p className="text-gray-600 mb-6">
        Evaluate proxy quality across speed, anonymity, safety, and reliability.
      </p>

      {actionMessage && (
        <div className={`rounded-lg p-4 mb-6 ${actionMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {actionMessage.message}
        </div>
      )}

      <div className="space-y-4">
        <button
          onClick={() => onAction('evaluate-proxies')}
          disabled={loading}
          className="w-full px-6 py-3 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Evaluating...' : '🔍 Evaluate All Proxies'}
        </button>

        {status?.evaluationResults && (
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Last Evaluation Results</h3>
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center">
                <div className="text-xl font-bold text-green-600">{status.evaluationResults.total || 0}</div>
                <div className="text-xs text-gray-500">Total</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-blue-600">{status.evaluationResults.excellent || 0}</div>
                <div className="text-xs text-gray-500">Excellent</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-yellow-600">{status.evaluationResults.good || 0}</div>
                <div className="text-xs text-gray-500">Good</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-red-600">{status.evaluationResults.poor || 0}</div>
                <div className="text-xs text-gray-500">Poor</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StrategyStep({ loading, actionMessage, onAction, status }) {
  const strategies = [
    { id: 'best-first', label: 'Best First', desc: 'Use highest-scored proxies first', icon: '🏆' },
    { id: 'fastest-first', label: 'Fastest First', desc: 'Prioritize lowest latency', icon: '⚡' },
    { id: 'random', label: 'Random', desc: 'Random proxy selection', icon: '🎲' },
    { id: 'round-robin', label: 'Round Robin', desc: 'Cycle through all proxies', icon: '🔄' },
    { id: 'geo-diverse', label: 'Geo-Diverse', desc: 'Spread across countries', icon: '🌍' },
    { id: 'stealth', label: 'Stealth', desc: 'Most stealthy proxies first', icon: '🕵️' },
  ];

  const currentStrategy = status?.strategy || 'best-first';

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Proxy Strategy</h2>
      <p className="text-gray-600 mb-6">
        Choose how proxies are selected during visits.
      </p>

      <div className="space-y-3 mb-6">
        {strategies.map((s) => (
          <button
            key={s.id}
            onClick={() => onAction('set-strategy', { strategy: s.id })}
            disabled={loading}
            className={`w-full text-left p-4 rounded-lg border transition-all ${
              currentStrategy === s.id
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{s.icon}</span>
                <div>
                  <div className="font-semibold text-gray-900">{s.label}</div>
                  <div className="text-sm text-gray-500">{s.desc}</div>
                </div>
              </div>
              {currentStrategy === s.id && <span className="text-indigo-600 font-medium">✓ Active</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function AIStep({ aiAvailable, loading, actionMessage, onAction }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">AI Check</h2>
      <p className="text-gray-600 mb-6">
        WebSense can use Ollama (free, local AI) for smart proxy recommendations and analysis.
      </p>

      {actionMessage && (
        <div className={`rounded-lg p-4 mb-6 ${actionMessage.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          {actionMessage.message}
        </div>
      )}

      <div className={`rounded-lg p-6 mb-6 ${aiAvailable ? 'bg-green-50' : 'bg-orange-50'}`}>
        <div className="flex items-center gap-4">
          <div className="text-4xl">{aiAvailable ? '✅' : '⚠️'}</div>
          <div>
            <h3 className="font-semibold text-gray-900">
              {aiAvailable ? 'AI is Available' : 'AI Not Available'}
            </h3>
            <p className="text-sm text-gray-600">
              {aiAvailable
                ? 'Smart proxy analysis and recommendations are enabled.'
                : 'Install Ollama and run "ollama serve" to enable AI features.'}
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={() => onAction('check-ai')}
        disabled={loading}
        className="px-6 py-3 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Checking...' : '🔄 Re-check AI Status'}
      </button>

      <div className="mt-4 text-sm text-gray-500">
        <p>To install Ollama:</p>
        <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded-lg mt-2 overflow-x-auto">
{`# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama
ollama serve

# Download a model
ollama pull llama3.1`}
        </pre>
      </div>
    </div>
  );
}

function ReadyStep({ proxyCount, aiAvailable }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-4">All Set! ✅</h2>
      <div className="bg-green-50 rounded-lg p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="text-5xl">🎉</div>
          <div>
            <h3 className="font-semibold text-green-900 text-lg">Ready to Go!</h3>
            <p className="text-sm text-green-700">
              You have {proxyCount} proxies loaded. {aiAvailable ? 'AI is enabled for smart recommendations.' : 'AI is not enabled but you can still run visits.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-indigo-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-indigo-700">{proxyCount}</div>
          <div className="text-sm text-gray-600">Proxies Ready</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-700">{aiAvailable ? 'On' : 'Off'}</div>
          <div className="text-sm text-gray-600">AI Engine</div>
        </div>
      </div>

      <button
        onClick={async () => {
          try { await startEngine('best-first'); } catch (e) {}
          window.location.href = '/';
        }}
        className="w-full px-6 py-4 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors text-lg"
      >
        🚀 Start Engine Now
      </button>
    </div>
  );
}
