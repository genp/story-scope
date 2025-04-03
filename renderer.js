const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const natural = require('natural');
const fk = require('flesch-kincaid');

const fileInput = document.getElementById('fileInput');
const textInput = document.getElementById('textInput');
let chartInstance = null;

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
      });
  }
}

function analyzeText() {
  const text = textInput.value;
  const tokenizer = new natural.WordTokenizer();
  const words = tokenizer.tokenize(text);
  const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
  const fkScore = fk({ sentence: sentences.length, word: words.length, syllable: words.length * 1.4 });

  const dialogue = (text.match(/"[^\n]*"/g) || []).join(' ').length;
  const action = (text.match(/\b(run|walk|grab|hit|throw|jump|shout)\b/gi) || []).length;
  const setting = (text.match(/\b(room|forest|city|night|day|sun|sky)\b/gi) || []).length;

  const results = `
    <h2>Results</h2>
    <p><strong>Unique Words:</strong> ${uniqueWords}</p>
    <p><strong>Reading Level (Flesch-Kincaid):</strong> Grade ${fkScore.grade}</p>
    <p><strong>Dialogue (chars):</strong> ${dialogue}</p>
    <p><strong>Action Keywords:</strong> ${action}</p>
    <p><strong>Setting Keywords:</strong> ${setting}</p>
  `;

  document.getElementById('results').innerHTML = results;
  drawChart({ dialogue, action, setting });
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

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
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
