const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const natural = require('natural');
const fk = require('flesch-kincaid');
const { ipcRenderer } = require('electron');

// Enable electron-reload for development hot reloading
try {
  require('electron-reload')(__dirname, {
    electron: require(`${__dirname}/node_modules/electron`)
  });
} catch (e) {
  console.log('electron-reload not available in production build.');
}

const fileInput = document.getElementById('fileInput');
const textInput = document.getElementById('textInput');

fileInput.addEventListener('change', handleFile);

function handleFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const ext = path.extname(file.name);
  if (ext === '.txt') {
    fs.readFile(file.path, 'utf8', (err, data) => {
      if (!err) textInput.value = data;
    });
  } else if (ext === '.docx') {
    mammoth.extractRawText({ path: file.path })
      .then(result => {
        textInput.value = result.value;
      })
      .catch(err => console.error("Error reading .docx:", err));
  }
}

// Auto-run analysis after reload if text exists
window.addEventListener('DOMContentLoaded', () => {
  if (textInput.value.trim().length > 0) {
    setTimeout(() => {
      if (typeof analyzeText === 'function') {
        analyzeText();
      }
    }, 500);
  }
});

// Request genre and author recommendations via main process
async function analyzeWithLLM() {
  const text = textInput.value;
  if (text.length < 100) {
    alert("Please provide a longer text sample for genre analysis.");
    return;
  }
  const llmResults = await ipcRenderer.invoke('fetch-genre-and-authors', text.slice(0, 1000));
  const resultBlock = document.createElement('div');
  resultBlock.innerHTML = `<h3>LLM Genre & Recommendations</h3><pre>${llmResults}</pre>`;
  document.getElementById('results').appendChild(resultBlock);
}

window.analyzeWithLLM = analyzeWithLLM;

// === Core Analysis ===
function analyzeText() {
  const text = textInput.value;
  const tokenizer = new natural.WordTokenizer();
  const words = tokenizer.tokenize(text);
  const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const fkScore = fk({ sentence: sentences.length, word: words.length, syllable: words.length * 1.4 });

  const dialogueText = (text.match(/"[^\\n]*"/g) || []).join(' ');
  const dialogue = dialogueText.length;
  const actionMatches = text.match(/\b(run|walk|grab|hit|throw|jump|shout)\b/gi) || [];
  const settingMatches = text.match(/\b(room|forest|city|night|day|sun|sky)\b/gi) || [];
  const characterMatches = text.match(/\b(he|she|they|man|woman|boy|girl|child|father|mother|friend)\b/gi) || [];

  const action = actionMatches.length;
  const setting = settingMatches.length;
  const characters = characterMatches.length;

  const summaryText = text.replace(/"[^\\n]*"/g, '');
  const summary = summaryText.length;

  const repeatedPhrases = findRepeatedPhrases(text);
  const repeatedHTML = repeatedPhrases.length
    ? `<ul>${repeatedPhrases.map(p => `<li>${p.phrase} (${p.count}x)</li>`).join('')}</ul>`
    : '<p>No repeated phrases found.</p>';

  const results = `
    <h2>Results</h2>
    <p><strong>Unique Words:</strong> ${uniqueWords}</p>
    <p><strong>Reading Level (Flesch-Kincaid):</strong> Grade ${fkScore.grade}</p>
    <p><strong>Dialogue (chars):</strong> ${dialogue}</p>
    <p><strong>Action Keywords:</strong> ${action}</p>
    <p><strong>Setting Keywords:</strong> ${setting}</p>
    <p><strong>Character References:</strong> ${characters}</p>
    <h3>Repeated Phrases:</h3>
    ${repeatedHTML}
  `;

  document.getElementById('results').innerHTML = results;
  drawChart({ dialogue, action, setting });
  drawPieChart({ summary, setting, action, dialogue, characters });

  drawCloud("cloudOverall", getWordFreq(text));
  drawCloud("cloudDialogue", getWordFreq(dialogueText));
  drawCloud("cloudAction", getWordFreq(actionMatches.join(' ')));
  drawCloud("cloudSetting", getWordFreq(settingMatches.join(' ')));
  drawCloud("cloudSummary", getWordFreq(summaryText));
}

function drawPieChart({ summary, setting, action, dialogue, characters }) {
  const ctx = document.getElementById('summaryPie').getContext('2d');
  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Summary', 'Setting', 'Action', 'Dialogue', 'Characters'],
      datasets: [{
        data: [summary, setting, action, dialogue, characters],
        backgroundColor: ['#8884d8', '#ffd700', '#36a2eb', '#82ca9d', '#ff9999']
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: 'Narrative Breakdown by Type'
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const label = context.label || '';
              const value = context.parsed;
              const total = context.chart._metasets[0].total;
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        },
        datalabels: {
          formatter: (value, ctx) => {
            const total = ctx.chart._metasets[0].total;
            const percentage = ((value / total) * 100).toFixed(1);
            return `${percentage}%`;
          },
          color: '#000'
        }
      }
    },
    plugins: [ChartDataLabels]
  });
}

function drawChart({ dialogue, action, setting }) {
  const ctx = document.getElementById('chartCanvas').getContext('2d');
  const data = {
    labels: ['Dialogue (chars)', 'Action (keywords)', 'Setting (keywords)'],
    datasets: [{
      label: 'Text Composition',
      data: [dialogue, action, setting],
      backgroundColor: ['#ff6384', '#36a2eb', '#ffce56'],
      borderWidth: 1
    }]
  };

  if (window.chartInstance) window.chartInstance.destroy();
  window.chartInstance = new Chart(ctx, {
    type: 'bar',
    data: data,
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: { display: true, text: 'Narrative Composition' }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function getWordFreq(text) {
  const tokenizer = new natural.WordTokenizer();
  const tokens = tokenizer.tokenize(text.toLowerCase());
  const freq = {};
  tokens.forEach(w => {
    if (w.length > 3) freq[w] = (freq[w] || 0) + 1;
  });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 50);
}

function drawCloud(canvasId, wordList) {
  WordCloud(document.getElementById(canvasId), {
    list: wordList,
    gridSize: 8,
    weightFactor: 4,
    fontFamily: 'sans-serif',
    color: 'random-dark',
    rotateRatio: 0.5,
    backgroundColor: '#fff'
  });
}

function findRepeatedPhrases(text, minWords = 3, maxWords = 6, minCount = 2) {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const phraseCounts = {};

  for (let size = minWords; size <= maxWords; size++) {
    for (let i = 0; i <= words.length - size; i++) {
      const phrase = words.slice(i, i + size).join(' ');
      phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
    }
  }

  return Object.entries(phraseCounts)
    .filter(([_, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase, count]) => ({ phrase, count }))
    .slice(0, 20);
}
