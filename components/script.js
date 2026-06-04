const CACHE_PREFIX = 'cache_';
const UPDATE_INTERVAL = 5 * 60 * 1000;
const SPLASH_TIMEOUT = 30000;
const GEO_TIMEOUT = 20000;
const NOMINATIM_USER_AGENT = 'MeuClima/1.0 (local testing)';
let splashTimeoutId = null;
const DOM_IDS = {
WEATHER_RESULT: 'weatherResult',
STATUS: 'status',
SPLASH_SCREEN: 'splashScreen',
PULL_TO_REFRESH: 'pullToRefresh',
MOON_INFO: 'moonInfo',
SUN_INFO: 'sunInfo',
EXTRAS: 'extras',
LOCATION_DATE: 'locationDate',
WEATHER_MESSAGE: 'weatherMessage',
ESTACAO_INFO: 'estacaoInfo',
NOTIFICACAO_ALERTA: 'notificacaoAlerta',
SUGESTAO_RECEITA: 'sugestaoReceita',
TELA_GRAFICOS: 'telaGraficos',
TELA_ESCALAS: 'telaEscalas',
TEMPERATURA_CHART: 'temperaturaChart',
PRECIPITACAO_CHART: 'precipitacaoChart',
VENTO_CHART: 'ventoChart'
};

const STYLES = {
ERROR_BOX: 'color:#ff6f00;text-align:center;padding:20px;',
SUCCESS_TEXT: 'color:#4bc194;',
WARNING_TEXT: 'color:#ccc;font-size:0.75em;',
VALUE_TEXT: 'color:#ffeb3b;'
};

const UI_STATE = {
touchStartY: 0,
isPulling: false,
isRefreshing: false,
currentTemperatureMessage: '',
weatherCache: null,
extrasCache: { extras: "", moon: "" }
};

// === PREVISÃO 5 DIAS ===
let _coordsCache = null;
let _forecast5Cache = null;

const styleErroModal = document.createElement('style');
styleErroModal.textContent = `
@keyframes erroSlideIn {
from { opacity: 0; transform: scale(0.95); }
to   { opacity: 1; transform: scale(1); }
}
.erro-overlay {
position: fixed;
top: 0; left: 0;
width: 100%; height: 100%;
background: rgba(0,0,0,0.85);
z-index: 50000;
display: flex;
align-items: center;
justify-content: center;
padding: 20px;
box-sizing: border-box;
animation: erroSlideIn 0.3s ease-out;
}
.erro-card {
background: #001133;
border-radius: 20px;
padding: 32px 24px;
max-width: 260px;
width: 100%;
text-align: center;
}
.erro-icone { font-size: 40px; margin-bottom: 16px; }
.erro-desc  { color: rgba(255,255,255,0.7); font-size: 14px; line-height: 1.5; margin: 0 0 24px; }
.erro-btn {
width: 100%;
padding: 14px;
border-radius: 40px;
border: none;
background: #ffeb3b;
color: #001133;
font-size: 15px;
font-weight: 700;
cursor: pointer;
}
`;
document.head.appendChild(styleErroModal);

function tentarComRetry(fn, maxTentativas = 3, intervalo = 4000) {
return new Promise(async (resolve, reject) => {
for (let i = 0; i < maxTentativas; i++) {
try {
const resultado = await fn();
return resolve(resultado);
} catch (err) {
console.warn(`Tentativa ${i + 1}/${maxTentativas} falhou:`, err.message);
if (i < maxTentativas - 1) {
await new Promise(r => setTimeout(r, intervalo));
}
}
}
reject(new Error(`Falhou após ${maxTentativas} tentativas`));
});
}

function reiniciarBuscaAutomatica() {
setTimeout(() => buscarPrevisaoPorGeolocalizacao(false), 5000);
}

function reiniciarBusca() {
buscarPrevisaoPorGeolocalizacao(false);
}
document.addEventListener('touchstart', function (e) {
if (window.scrollY === 0) {
UI_STATE.touchStartY = e.touches[0].clientY;
UI_STATE.isPulling = true;
}
}, { passive: true });

document.addEventListener('touchmove', function (e) {
if (!UI_STATE.isPulling || UI_STATE.isRefreshing) return;

const touchY = e.touches[0].clientY;
const distance = touchY - UI_STATE.touchStartY;

const refreshDiv = document.getElementById(DOM_IDS.PULL_TO_REFRESH);

if (distance > 50) {
refreshDiv.style.opacity = '1';
} else {
refreshDiv.style.opacity = '0';
}
}, { passive: true });

document.addEventListener('touchend', function (e) {
if (!UI_STATE.isPulling || UI_STATE.isRefreshing) return;

const touchEndY = e.changedTouches[0].clientY;
const distance = touchEndY - UI_STATE.touchStartY;
const refreshDiv = document.getElementById(DOM_IDS.PULL_TO_REFRESH);

if (distance > 80) {
UI_STATE.isRefreshing = true;
refreshDiv.style.opacity = '1';

atualizarDados().then(() => {
setTimeout(() => {
refreshDiv.style.opacity = '0';
UI_STATE.isRefreshing = false;
}, 800);
});
} else {
refreshDiv.style.opacity = '0';
}

UI_STATE.isPulling = false;
}, { passive: true });

async function atualizarDados() {
console.log('Atualizando dados...');
await buscarPrevisaoPorGeolocalizacao(false);
}

// ============================================
// MODAL DE ERRO
// ============================================
function mostrarErro() {
// Remove modal anterior se existir
const modalExistente = document.getElementById('modal-erro-wrap');
if (modalExistente) modalExistente.remove();

const modal = document.createElement('div');
modal.id = 'modal-erro-wrap';
modal.className = 'erro-overlay';
modal.innerHTML = `
<div class="erro-card">
<div class="erro-icone">⚠️</div>
<p class="erro-desc">Não foi possível carregar.<br>Verifique sua conexão ou GPS.</p>
<button id="btn-erro-retry" class="erro-btn">Tentar novamente</button>
</div>
`;
document.body.appendChild(modal);

const btnRetry = document.getElementById('btn-erro-retry');
if (btnRetry) {
btnRetry.addEventListener('click', async function tentarNovamente() {
const modalAtual = document.getElementById('modal-erro-wrap');
if (!modalAtual) return;

// Mostra loading
modalAtual.querySelector('.erro-card').innerHTML = `
<div class="erro-icone" style="font-size:32px;">⏳</div>
<p class="erro-desc">Conectando...</p>
<div class="spinner" style="margin:0 auto;"></div>
`;

// RESETA ESTADOS
UI_STATE.weatherCache = null;
UI_STATE.isRefreshing = false;
UI_STATE.isPulling = false;

let sucesso = false;

try {
await new Promise(resolve => setTimeout(resolve, 500));
await buscarPrevisaoPorGeolocalizacao(true);
sucesso = true;
} catch (error) {
console.error('Falha na nova tentativa:', error);
sucesso = false;
}

if (sucesso) {
const modalParaRemover = document.getElementById('modal-erro-wrap');
if (modalParaRemover) modalParaRemover.remove();
} else {
// Recria o modal de erro
if (modalAtual) {
modalAtual.innerHTML = `
<div class="erro-card">
<div class="erro-icone">⚠️</div>
<p class="erro-desc">Falha na conexão.<br>Verifique sua internet e GPS.</p>
<button id="btn-erro-retry" class="erro-btn">Tentar novamente</button>
</div>
`;
const novoBtn = document.getElementById('btn-erro-retry');
if (novoBtn) {
novoBtn.addEventListener('click', () => mostrarErro());
}
}
}
});
}

// Limpa resultado anterior
const resultDiv = document.getElementById(DOM_IDS.WEATHER_RESULT);
const statusDiv = document.getElementById(DOM_IDS.STATUS);
if (resultDiv) resultDiv.innerHTML = '';
if (statusDiv) statusDiv.innerHTML = '';
}

function limparCachePorPrioridade() {
const itens = [];

for (let i = 0; i < localStorage.length; i++) {
const chave = localStorage.key(i);
if (chave.startsWith(CACHE_PREFIX)) {
try {
const item = JSON.parse(localStorage.getItem(chave));
itens.push({
chave,
timestamp: item.timestamp,
prioridade: item.prioridade || 0
});
} catch {
localStorage.removeItem(chave);
}
}
}

itens.sort((a, b) => a.prioridade - b.prioridade || a.timestamp - b.timestamp);

const quantidadeRemover = Math.ceil(itens.length * 0.2);
for (let i = 0; i < quantidadeRemover; i++) {
localStorage.removeItem(itens[i].chave);
}
}

function limparCacheAntigoMaisAgressivo(removerPercentual = 0.5) {
const agora = Date.now();
const itensCache = [];

for (let i = 0; i < localStorage.length; i++) {
const chave = localStorage.key(i);
if (chave && chave.startsWith(CACHE_PREFIX)) {
try {
const registro = JSON.parse(localStorage.getItem(chave));
if (registro && typeof registro === 'object' && typeof registro.timestamp === 'number') {
itensCache.push({
chave,
timestamp: registro.timestamp,
expira: typeof registro.expira === 'number' ? registro.expira : 0
});
} else {
itensCache.push({ chave, invalido: true });
}
} catch {
itensCache.push({ chave, invalido: true });
}
}
}

itensCache.forEach(item => {
if (item.invalido) {
localStorage.removeItem(item.chave);
} else if (item.expira > 0 && (item.timestamp + item.expira) < agora) {
localStorage.removeItem(item.chave);
}
});

const itensValidos = itensCache.filter(item =>
!item.invalido &&
!(item.expira > 0 && (item.timestamp + item.expira) < agora)
);

if (itensValidos.length > 0) {
itensValidos.sort((a, b) => a.timestamp - b.timestamp);
const quantidadeRemover = Math.ceil(itensValidos.length * removerPercentual);

for (let i = 0; i < quantidadeRemover; i++) {
localStorage.removeItem(itensValidos[i].chave);
}
}
}

function salvarCache(chave, dados, duracaoMin = 10, prioridade = 1) {
if (typeof localStorage === 'undefined') {
console.warn('localStorage não está disponível neste ambiente');
return false;
}

const registro = {
timestamp: Date.now(),
expira: duracaoMin * 60 * 1000,
dados: dados,
prioridade: prioridade
};

const tentarSalvar = () => {
try {
const chaveCompleta = `${CACHE_PREFIX}${chave}`;
const dadosSerializados = JSON.stringify(registro);

if (dadosSerializados.length > 2 * 1024 * 1024) {
console.warn('Dados muito grandes para cache', chaveCompleta);
return false;
}

localStorage.setItem(chaveCompleta, dadosSerializados);
return true;
} catch (e) {
if (e.name === 'QuotaExceededError') {
console.warn('Espaço insuficiente, acionando limpeza...');
return false;
}
console.error('Erro ao salvar no cache:', e);
return false;
}
};

if (tentarSalvar()) return true;

limparCachePorPrioridade();
if (tentarSalvar()) return true;

limparCacheAntigoMaisAgressivo(0.5);
if (tentarSalvar()) return true;

console.error('Falha ao salvar no cache após múltiplas tentativas');
return false;
}

document.addEventListener('DOMContentLoaded', () => {
limparCacheAntigoMaisAgressivo();
});

function finalizarPullToRefresh() {
UI_STATE.isRefreshing = false;
const pullElement = document.getElementById('pullToRefresh');
if (pullElement) {
pullElement.style.transform = 'translateY(0)';
pullElement.style.transition = 'transform 0.3s ease';
}
}

function verificarAlertas(weatherData) {
const notificacao = document.getElementById('notificacaoAlerta');
const current = weatherData.current;
let alertas = [];

if (current.temp_c >= 35) {
alertas.push(`🔥 Calor extremo! ${current.temp_c}°C`);
}
if (current.temp_c <= 5) {
alertas.push(`🥶 Frio intenso! ${current.temp_c}°C`);
}
if (current.precip_mm >= 10) {
alertas.push(`🌧️ Chuva forte! ${current.precip_mm}mm`);
}
if (current.wind_kph >= 31) {
alertas.push(`💨 Vento forte! ${current.wind_kph.toFixed(1)} km/h`);
}

if (alertas.length > 0) {
const alertaSelecionado = alertas[Math.floor(Math.random() * alertas.length)];

notificacao.textContent = alertaSelecionado;
notificacao.style.display = 'block';
setTimeout(() => {
notificacao.style.opacity = '1';
}, 10);
setTimeout(() => {
notificacao.style.opacity = '0';
setTimeout(() => {
notificacao.style.display = 'none';
}, 300);
}, 5000);
}
}

function obterFaixaTemperatura(temp) {
if (temp < 15) return "frio";
if (temp <= 22) return "fresco";
if (temp <= 30) return "agradável";
if (temp <= 39) return "calor";
return "intenso";
}

function mostrarSugestaoReceita(tempAtual) {
const box = document.getElementById('sugestaoReceita');

if (!box) return;

if (getSpecialDateMessage(tempAtual)) {
console.log('📅 Data especial: receita oculta');
box.style.display = 'none';
box.innerHTML = '';
return;
}

console.log('📌 Dia normal: buscando receita para', tempAtual, '°C');

fetch('receitas.json')
.then(res => {
if (!res.ok) throw new Error('HTTP error');
return res.json();
})
.then(receitas => {
const faixa = obterFaixaTemperatura(tempAtual);
const receitasDaFaixa = receitas.filter(r =>
r.faixa && r.nome && !r._comentario && r.faixa === faixa
);

if (receitasDaFaixa.length > 0) {
const receita = receitasDaFaixa[Math.floor(Math.random() * receitasDaFaixa.length)];
box.innerHTML = `
<p style="margin-bottom: 0.6em; font-size: 1.1em; margin-top: 6px;">
Hoje pede: ${receita.emoji}
<strong>${receita.nome}</strong>
</p>
<p style="margin-top: 0.4em; font-size: 1.0em; line-height: 1.2em;">${receita.descricao}</p>
`;
box.style.display = 'block';
} else {
box.style.display = 'none';
box.innerHTML = '';
}
})
.catch(err => {
console.warn("Erro ao carregar receitas:", err);
box.style.display = 'none';
box.innerHTML = '';
});
}

function gerarSugestaoVestuario(temp, precip_mm, wind_kph) {
const faixaTemp = obterFaixaTemperatura(temp);

// Parte 1 — temperatura: declaração limpa, sem pontuação final
const sugestoesTemp = {
frio: [
"Dia frio e gelado hoje aqui no local",
"Temperatura bem baixa agora pela manhã",
"Friozinho intenso hoje durante o dia",
"Frio de doer forte hoje em toda região",
"Dia de frio forte agora neste momento"
],
fresco: [
"Clima ameno e gostoso hoje pela cidade",
"Temperatura amena agora durante o dia",
"Fresquinho muito bom hoje para sair",
"Clima fresco e agradável hoje",
"Está fresco e bom agora aqui na área"
],
agradável: [
"Temperatura ideal hoje para atividades",
"Dia perfeito pra sair e aproveitar o clima",
"Dia de clima ideal agora pela manhã cedo",
"Clima ótimo hoje aqui em toda a região",
"Clima agradável agora neste momento do dia"
],
calor: [
"Calor moderado lá fora durante todo o dia",
"Bastante calor lá fora agora pela cidade",
"Temperatura alta hoje em toda a região",
"Está quente demais hoje aqui hoje",
"Calor forte e intenso agora pela manhã"
],
muitoCalor: [
"Dia de muito calor e intenso hoje",
"Temperatura muito alta agora durante o dia",
"Calor extremo hoje nesta cidade",
"Calorão forte demais aqui por toda região",
"Muito calor e abafado hoje neste momento"
]
};

// Parte 2 — chuva: contexto + conselho, minúsculo para encaixar após vírgula
const sugestoesChuva = {
garoa: [
"com garoa fina no caminho hoje de manhã",
"com chuvisco previsto para a região agora",
"pode cair uma garoa durante o dia",
"garoa leve e bem rápida neste momento",
"possível garoa agora pela manhã"
],
fraca: [
"com chuva fraca agora durante a manhã",
"chuvinha leve caindo neste exato momento",
"chuva fraca no local por toda a manhã",
"chuva leve no momento em toda a região",
"com chuva fina e leve agora pela cidade"
],
moderada: [
"com chuva moderada agora durante o dia",
"chuva firme caindo neste local da cidade",
"chuva média no local por algumas horas",
"chuva constante agora em toda a região",
"com precipitação média hoje pela manhã"
],
forte: [
"com chuva forte agora durante a manhã",
"chuva pesada caindo neste momento",
"chuva intensa no local por toda a manhã",
"chuva forte no momento em toda a região",
"com precipitação forte agora pela cidade"
],
intensa: [
"com chuva extrema agora neste local",
"chuva torrencial caindo durante toda manhã",
"tempestade forte agora em toda a região",
"chuva intensa no local por várias horas",
"com precipitação extrema agora"
],
semChuva: [
"tempo seco e bom hoje durante todo o dia",
"sem chuva nenhuma agora nesta região toda",
"céu limpo e seco em toda a área hoje",
"dia aberto e seco agora neste local",
"sem precipitação hoje pela manhã e tarde"
]
};

// Parte 3a — vento sem chuva: já traz o finalizador embutido
const sugestoesVento = {
calminho: [
"e vento calmo. Aproveite!",
"e sem vento nenhum. Bom dia!",
"com vento zero. Aproveite!",
"e clima parado. Tenha um bom dia!",
"e vento tranquilo. Aproveite!"
],
brisaLeve: [
"e brisa leve e suave. Bom dia!",
"com vento suave. Curta!",
"e vento leve e gostoso. Bom dia!",
"e brisa fresca. Aproveite!",
"e ventinho bom. Tenha um bom dia!"
],
moderado: [
"e vento moderado durante o dia.",
"com vento médio no local agora.",
"e vento presente agora. Bom dia!",
"e ventania leve por aqui.",
"e vento constante durante o dia."
],
forte: [
"e vento forte no local hoje.",
"com ventania forte agora por aqui.",
"e rajadas fortes durante o dia.",
"e vento intenso no momento.",
"e ventos fortes hoje na região."
],
muitoForte: [
"e vendaval forte por aqui hoje.",
"com vento extremo agora na região.",
"e vento muito intenso neste momento.",
"e rajadas severas agora pelo local.",
"e tempestade de vento agora aqui."
]
};

// Parte 3b — vento com chuva: segunda sentença autônoma (já com espaço e ponto)
const sugestoesVentoComChuva = {
calminho: [
" O vento está bem calmo ao menos.",
" Sem vento forte hoje, apenas a chuva.",
" O vento está tranquilo apesar da chuva.",
" O vento não preocupa neste momento.",
" Apenas vento leve e suave hoje."
],
brisaLeve: [
" O vento está leve junto com a chuva.",
" A brisa é suave apesar da chuva hoje.",
" O ventinho está fraco com a chuva agora.",
" O vento está calmo com a chuva no local.",
" A brisa leve acompanha a chuva hoje."
],
moderado: [
" O vento está moderado com a chuva agora.",
" A ventania leve vem com a chuva no local.",
" O vento médio acompanha a precipitação.",
" O vento presente vem junto da chuva hoje.",
" As rajadas médias vêm com a chuva agora."
],
forte: [
" O vento está forte com a chuva intensa hoje.",
" A ventania e a chuva estão bem intensas.",
" O vento intenso vem com a chuva no local.",
" As rajadas fortes acompanham a precipitação.",
" A tempestade de vento vem com chuva agora."
],
muitoForte: [
" O vento extremo vem com chuva forte hoje.",
" O vendaval e a chuva torrencial estão aí.",
" A tempestade severa de vento e chuva chegou.",
" O vento perigoso vem com precipitação agora.",
" As rajadas extremas vêm com chuva intensa."
]
};

function pegarAleatorio(lista) {
return lista[Math.floor(Math.random() * lista.length)];
}

// Temperatura
let chaveTemp = faixaTemp === "intenso" ? "muitoCalor" : faixaTemp;
let parteTemp = pegarAleatorio(sugestoesTemp[chaveTemp] || ["Clima desconhecido"]);

// Chuva
let chaveChuva = "semChuva";
if (precip_mm > 0.2) {
if (precip_mm <= 1.9)      chaveChuva = "garoa";
else if (precip_mm <= 3.9) chaveChuva = "fraca";
else if (precip_mm <= 9.9) chaveChuva = "moderada";
else if (precip_mm <= 19.9) chaveChuva = "forte";
else                        chaveChuva = "intensa";
}
let parteChuva = pegarAleatorio(sugestoesChuva[chaveChuva]).trim();

// Vento
const temChuva = chaveChuva !== "semChuva";
let chaveVento = "calminho";
if (wind_kph >= 2  && wind_kph <= 9.9)  chaveVento = "brisaLeve";
else if (wind_kph <= 30.9)              chaveVento = "moderado";
else if (wind_kph <= 74.9)              chaveVento = "forte";
else if (wind_kph > 74.9)              chaveVento = "muitoForte";

// Montar frase
// Sem chuva: "Temperatura, chuva, vento descritivo. Finalizador!"
// Com chuva:  "Temperatura, chuva. Vento+chuva autônomo."
let frase;
if (!temChuva) {
// Separa "parte descritiva. Finalizador!" para capitalizar corretamente
const ventoRaw = pegarAleatorio(sugestoesVento[chaveVento]).trim();
const pontoIdx = ventoRaw.indexOf('. ');
let ventoDesc, ventoFinal;
if (pontoIdx !== -1) {
ventoDesc = ventoRaw.slice(0, pontoIdx).toLowerCase();
ventoFinal = ventoRaw.slice(pontoIdx + 2);
} else {
ventoDesc = ventoRaw.slice(0, -1).toLowerCase();
ventoFinal = '';
}
frase = `${parteTemp}, ${parteChuva.toLowerCase()}, ${ventoDesc}. ${ventoFinal}`;
frase = frase.charAt(0).toUpperCase() + frase.slice(1);
} else {
const parteVento = pegarAleatorio(sugestoesVentoComChuva[chaveVento]).trim();
frase = `${parteTemp}, ${parteChuva.toLowerCase()}. ${parteVento}`;
frase = frase.charAt(0).toUpperCase() + frase.slice(1);
}

return frase;
}

function getPreciseSeasonDates(year) {
return {
OUTONO:    { date: new Date(year, 2, 20, 12, 0, 0), emoji: "🍂" },    // 20 março
INVERNO:   { date: new Date(year, 5, 20, 12, 0, 0), emoji: "🧊" },    // 20 junho
PRIMAVERA: { date: new Date(year, 8, 22, 12, 0, 0), emoji: "🌸" },    // 22 setembro
VERÃO:     { date: new Date(year, 11, 21, 12, 0, 0), emoji: "☀️" }    // 21 dezembro
};
}

function getCurrentSeason(date = new Date()) {
const year = date.getFullYear();
const seasons = getPreciseSeasonDates(year);
const outonoAnterior = getPreciseSeasonDates(year - 1).OUTONO.date;

if (date >= outonoAnterior && date < seasons.INVERNO.date) return "OUTONO";
if (date >= seasons.INVERNO.date && date < seasons.PRIMAVERA.date) return "INVERNO";
if (date >= seasons.PRIMAVERA.date && date < seasons.VERÃO.date) return "PRIMAVERA";
return "VERÃO";
}

function getSeasonDates(season, year = new Date().getFullYear()) {
const seasonDates = getPreciseSeasonDates(year);
const seasonsOrder = ["OUTONO", "INVERNO", "PRIMAVERA", "VERÃO"];
const currentIndex = seasonsOrder.indexOf(season);
const nextIndex = (currentIndex + 1) % seasonsOrder.length;
const nextSeason = seasonsOrder[nextIndex];

let startDate = seasonDates[season].date;
let endDate;

if (season === "VERÃO") {
startDate = getPreciseSeasonDates(year - 1).VERÃO.date;
endDate = seasonDates.OUTONO.date;
} else if (nextSeason === "VERÃO") {
endDate = getPreciseSeasonDates(year + 1).VERÃO.date;
} else {
endDate = seasonDates[nextSeason].date;
}

return {
start: startDate,
end: endDate,
emoji: seasonDates[season].emoji,
next: nextSeason
};
}

async function atualizarEstacao() {
try {
const hoje = new Date();
const ano = hoje.getFullYear();

const estacao = getCurrentSeason(hoje);
const { end, emoji, next } = getSeasonDates(estacao, ano);

const frases = {
VERÃO:     ["Protetor solar! 🧴", "Picolé liberado 🍦", "Praia chamando! 🏖️", "Sol intenso! ☀️"],
OUTONO:    ["Folhas secas 🍁", "Chá perfeito 🍵", "Casaquinho já! 🧥", "Natureza colorida 🍂"],
INVERNO:   ["Chocolate quente 🍫", "Edredom ON 🌙", "Friozinho bom 🎬", "Lareira acesa 🔥"],
PRIMAVERA: ["Flores por toda parte! 🌷", "Beija-flor voltou 🐦", "Piquenique talvez 🧺", "Perfume natural 🌸"]
};

const seasonDates = getPreciseSeasonDates(ano);
const nextEmoji = seasonDates[next].emoji;

function diffMesesDias(inicio, fim) {
let months = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
const temp = new Date(inicio);
temp.setMonth(temp.getMonth() + months);
if (temp > fim) {
months--;
temp.setMonth(temp.getMonth() - 1);
}
const days = Math.round((fim - temp) / 864e5);
return { months, days };
}

const { months: mesesRest, days: diasRest } = diffMesesDias(hoje, end);
const textoRestante = mesesRest > 0
? `${mesesRest} ${mesesRest === 1 ? 'mês' : 'meses'} e ${diasRest} dia${diasRest !== 1 ? 's' : ''}`
: `${diasRest} dia${diasRest !== 1 ? 's' : ''}`;

const formatarDataLonga = (data) => {
const meses = [
'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];
return `${data.getDate()} de ${meses[data.getMonth()]}`;
};

const info = document.getElementById("estacaoInfo");
const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

if (info) {
info.innerHTML = `
<div style="text-align:center; font-size:0.85rem; line-height:1.4;">
${emoji} ${capitalize(estacao)} até ${formatarDataLonga(end)}  ${nextEmoji} ${capitalize(next)} em ${textoRestante}
</div>
`;
}

} catch (err) {
console.error('Erro ao atualizar estação:', err);
const info = document.getElementById("estacaoInfo");
if (info) {
info.innerHTML = `
<div style="color:#ff6b6b; padding:10px; background:#fff0f0; border-radius:5px;">
⚠️ Erro ao carregar informações das estações: ${err.message}
</div>
`;
}
}
}

window.addEventListener('load', () => {
atualizarEstacao();
setInterval(atualizarEstacao, 86400000);
});

let temperaturaChart = null;
let precipitacaoChart = null;
let ventoChart = null;

function abrirTelaGraficos() {
// Fix: garante _coordsCache mesmo se GPS demorou
if (!_coordsCache && UI_STATE.weatherCache) {
const loc = UI_STATE.weatherCache?.current?.location
           || UI_STATE.weatherCache?.forecast?.location;
if (loc?.lat && loc?.lon) {
_coordsCache = { lat: parseFloat(loc.lat), lon: parseFloat(loc.lon) };
}
}
const tela = document.getElementById('telaGraficos');
tela.style.display = 'block';
document.body.classList.add('modal-aberto');
history.pushState({modal: 'Graficos'}, '');
setTimeout(() => {
tela.style.opacity = '1';
carregarGraficos();
}, 10);
}

function abrirTelaEscalas() {
// NÃO FECHA nada - apenas abre Escalas por cima
const tela = document.getElementById('telaEscalas');
if (tela) {
tela.style.display = 'block';
document.body.classList.add('modal-aberto');
tela.style.zIndex = '10001';
history.pushState({modal: 'Escalas'}, '');
setTimeout(() => {
tela.style.opacity = '1';
}, 10);
}
}

function fecharModal(tipo, event = null) {
if (event) {
event.preventDefault();
event.stopPropagation();
}

const telaGraficos = document.getElementById('telaGraficos');
const telaEscalas = document.getElementById('telaEscalas');
const tela5Dias = document.getElementById('tela5Dias');

if (tipo === 'Escalas') {
// VOLTAR: fecha Escalas e volta para a tela anterior
telaEscalas.style.display = 'none';

// Verifica qual tela estava aberta antes
if (tela5Dias && tela5Dias.style.display === 'block') {
// Já está aberta - não faz nada, só fechou Escalas
document.body.classList.add('modal-aberto');
} else if (telaGraficos) {
telaGraficos.style.display = 'block';
document.body.classList.add('modal-aberto');
carregarGraficos();
} else {
// Fallback
if (telaGraficos) {
telaGraficos.style.display = 'block';
document.body.classList.add('modal-aberto');
carregarGraficos();
}
}
return;
}

// FECHAR (Graficos ou qualquer outro) -> Tela Inicial
if (telaGraficos) telaGraficos.style.display = 'none';
if (telaEscalas) telaEscalas.style.display = 'none';
if (tela5Dias) tela5Dias.style.display = 'none';

document.body.classList.remove('modal-aberto');

if (temperaturaChart) { temperaturaChart.destroy(); temperaturaChart = null; }
if (precipitacaoChart) { precipitacaoChart.destroy(); precipitacaoChart = null; }
if (ventoChart) { ventoChart.destroy(); ventoChart = null; }
}

function mapearFaixa(valor, faixas) {
for (const faixa of faixas) {
if (valor >= faixa.min && valor <= faixa.max) return faixa.label;
}
return faixas[faixas.length - 1].label;
}

const FAIXAS_PRECIPITACAO = [
{ min: 0, max: 0.2, label: "Sem chuva" },
{ min: 0.2, max: 1, label: "Garoa leve" },
{ min: 1, max: 4, label: "Chuva fraca" },
{ min: 4, max: 10, label: "Moderada" },
{ min: 10, max: 20, label: "Chuva forte" },
{ min: 20, max: 50, label: "Muito forte" },
{ min: 50, max: Infinity, label: "Chuva extrema" }
];

const FAIXAS_VENTO = [
{ min: 0,   max: 1,        label: "Sem vento" },
{ min: 1,   max: 19,       label: "Brisinha leve" },
{ min: 19,  max: 38,       label: "Vento moderado" },
{ min: 38,  max: 49,       label: "Ventania" },
{ min: 49,  max: 74,       label: "Quase voando" },
{ min: 74,  max: 102,      label: "Muito forte" },
{ min: 102, max: Infinity, label: "Destrutivo" }
];

function getDescricaoPrecipitacao(mm) {
return mapearFaixa(mm, FAIXAS_PRECIPITACAO);
}

function getDescricaoVento(kph) {
return mapearFaixa(kph, FAIXAS_VENTO);
}

function calcularMedia(dados) {
if (!dados || dados.length === 0) return 0;
return dados.reduce((soma, valor) => soma + valor, 0) / dados.length;
}

function destruirGraficos() {
if (typeof temperaturaChart !== "undefined" && temperaturaChart) {
temperaturaChart.destroy();
temperaturaChart = null;
}
if (typeof precipitacaoChart !== "undefined" && precipitacaoChart) {
precipitacaoChart.destroy();
precipitacaoChart = null;
}
if (typeof ventoChart !== "undefined" && ventoChart) {
ventoChart.destroy();
ventoChart = null;
}
}

function getEmojiFromTemperature(temp) {
const faixa = emojiByTemperature.find(range => temp >= range.min && temp <= range.max);
return faixa.emoji;
}

async function carregarGraficos() {
if (!UI_STATE.weatherCache) {
console.log("Aguardando dados do tempo…");

// Mostra "Carregando" nos gráficos
const canvasTemperatura = document.getElementById('temperaturaChart');
const canvasPrecipitacao = document.getElementById('precipitacaoChart');
const canvasVento = document.getElementById('ventoChart');

const mostrarMensagem = (canvas, msg) => {
if (canvas) {
const ctx = canvas.getContext('2d');
ctx.clearRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#ccc';
ctx.font = '14px sans-serif';
ctx.textAlign = 'center';
ctx.fillText(msg, canvas.width/2, canvas.height/2);
}
};

mostrarMensagem(canvasTemperatura, '⏳ Carregando temperatura...');
mostrarMensagem(canvasPrecipitacao, '⏳ Carregando precipitação...');
mostrarMensagem(canvasVento, '⏳ Carregando vento...');

for (let i = 0; i < 80; i++) {
await new Promise(r => setTimeout(r, 100));
if (UI_STATE.weatherCache) break;
}
if (!UI_STATE.weatherCache) {
// Avisa no canvas em vez de sumir silenciosamente
[canvasTemperatura, canvasPrecipitacao, canvasVento].forEach(c => {
if (!c) return;
const ctx = c.getContext('2d');
ctx.clearRect(0, 0, c.width, c.height);
ctx.fillStyle = '#ffeb3b';
ctx.font = '13px sans-serif';
ctx.textAlign = 'center';
ctx.fillText('Dados não disponíveis.', c.width / 2, c.height / 2 - 10);
ctx.fillText('Feche e tente novamente.', c.width / 2, c.height / 2 + 10);
});
return;
}
}

if (typeof Chart === "undefined") {
console.error('Chart.js não está carregado!');
return;
}

destruirGraficos();

const forecast = UI_STATE.weatherCache.forecast;
const horasDia1 = forecast.forecast.forecastday[0].hour;
const horasDia2 = forecast.forecast.forecastday[1]?.hour || [];
const todasHoras = [...horasDia1, ...horasDia2];

const agora = new Date();
const horasFiltradas = todasHoras
.filter(h => {
const diff = (new Date(h.time) - agora) / 3.6e6;
return diff >= 0 && diff <= 24;
})
.sort((a, b) => new Date(a.time) - new Date(b.time));

if (!horasFiltradas.length) return;

const labels = horasFiltradas.map(h => `${new Date(h.time).getHours()}h`);
const tempData = horasFiltradas.map(h => h.temp_c);
const precipData = horasFiltradas.map(h => h.precip_mm);
const ventoData = horasFiltradas.map(h => h.wind_kph);

const mediaTemp24h = calcularMedia(tempData);
const mediaPrecip24h = calcularMedia(precipData);
const mediaVento24h = calcularMedia(ventoData);
const minTemp24h = Math.min(...tempData);
const maxTemp24h = Math.max(...tempData);

const emojiTemp = getEmojiFromTemperature(mediaTemp24h);
const descricaoPrecip = getDescricaoPrecipitacao(mediaPrecip24h);
const descricaoVento = getDescricaoVento(mediaVento24h);
const legendaTemp = `${emojiTemp} ${descricoes[emojiTemp] || ""}`.trim();

const tendencia = (() => {
if (tempData.length < 5) return 0;
const diff = calcularMedia(tempData.slice(1, 5)) - tempData[0];
return Math.abs(diff) > 0.5 ? diff : 0;
})();
const setaTendencia = tendencia > 0 ? "▲" : tendencia < 0 ? "▼" : "⬤";

const tempCtx = document.getElementById('temperaturaChart').getContext('2d');
const tempGrad = tempCtx.createLinearGradient(0, 0, 0, 180);
tempGrad.addColorStop(0, 'rgba(255,235,59,0.35)');
tempGrad.addColorStop(1, 'rgba(255,235,59,0.01)');
temperaturaChart = new Chart(tempCtx, {
type: 'line',
data: {
labels,
datasets: [{
label: `🌡️ min ${minTemp24h.toFixed(1)}° / max ${maxTemp24h.toFixed(1)}° ${legendaTemp} ${setaTendencia}`,
data: tempData,
borderColor: '#ffeb3b',
backgroundColor: tempGrad,
borderWidth: 1.5,
fill: true,
tension: 0.4,
pointRadius: 3,
pointHoverRadius: 5,
pointBackgroundColor: '#002244',
pointBorderColor: '#ffeb3b',
pointBorderWidth: 1.5
}]
},
options: {
responsive: true,
interaction: { mode: 'index', intersect: false },
plugins: {
legend: {
labels: {
color: '#ffeb3b',
font: { size: 12 },
usePointStyle: true,
boxWidth: 0,
padding: 8
}
},
tooltip: {
backgroundColor: 'rgba(0,20,50,0.92)',
titleColor: '#ffeb3b',
bodyColor: '#ffffff',
borderColor: 'rgba(255,235,59,0.3)',
borderWidth: 1,
padding: 8,
titleFont: { size: 11 },
bodyFont: { size: 11 },
callbacks: {
label: ctx => ` ${ctx.parsed.y.toFixed(1)} °C`
}
}
},
scales: {
x: {
ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 }, maxRotation: 0 },
grid: { color: 'rgba(255,255,255,0.06)' }
},
y: {
ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } },
grid: { color: 'rgba(255,255,255,0.06)' }
}
}
}
});

const precipCtx = document.getElementById('precipitacaoChart').getContext('2d');
const precipGrad = precipCtx.createLinearGradient(0, 0, 0, 180);
precipGrad.addColorStop(0, 'rgba(66,165,245,0.35)');
precipGrad.addColorStop(1, 'rgba(66,165,245,0.01)');
precipitacaoChart = new Chart(precipCtx, {
type: 'line',
data: {
labels,
datasets: [{
label: `🌧️ Média ${mediaPrecip24h.toFixed(1)} mm – ${descricaoPrecip}`,
data: precipData,
borderColor: '#42a5f5',
backgroundColor: precipGrad,
borderWidth: 1.5,
fill: true,
tension: 0.4,
pointRadius: 3,
pointHoverRadius: 5,
pointBackgroundColor: '#002244',
pointBorderColor: '#42a5f5',
pointBorderWidth: 1.5
}]
},
options: {
responsive: true,
interaction: { mode: 'index', intersect: false },
plugins: {
legend: {
labels: {
color: '#42a5f5',
font: { size: 12 },
usePointStyle: true,
boxWidth: 0,
padding: 8
}
},
tooltip: {
backgroundColor: 'rgba(0,20,50,0.92)',
titleColor: '#42a5f5',
bodyColor: '#ffffff',
borderColor: 'rgba(66,165,245,0.3)',
borderWidth: 1,
padding: 8,
titleFont: { size: 11 },
bodyFont: { size: 11 },
callbacks: {
label: ctx => ` ${ctx.parsed.y.toFixed(2)} mm`
}
}
},
scales: {
x: {
ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 }, maxRotation: 0 },
grid: { color: 'rgba(255,255,255,0.06)' }
},
y: {
ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } },
grid: { color: 'rgba(255,255,255,0.06)' }
}
}
}
});

const ventoCtx = document.getElementById('ventoChart').getContext('2d');
const ventoGrad = ventoCtx.createLinearGradient(0, 0, 0, 180);
ventoGrad.addColorStop(0, 'rgba(76,175,80,0.35)');
ventoGrad.addColorStop(1, 'rgba(76,175,80,0.01)');
ventoChart = new Chart(ventoCtx, {
type: 'line',
data: {
labels,
datasets: [{
label: `🍃 Média ${mediaVento24h.toFixed(1)} km/h – ${descricaoVento}`,
data: ventoData,
borderColor: '#4caf50',
backgroundColor: ventoGrad,
borderWidth: 1.5,
fill: true,
tension: 0.4,
pointRadius: 3,
pointHoverRadius: 5,
pointBackgroundColor: '#002244',
pointBorderColor: '#4caf50',
pointBorderWidth: 1.5
}]
},
options: {
responsive: true,
interaction: { mode: 'index', intersect: false },
plugins: {
legend: {
labels: {
color: '#4caf50',
font: { size: 12 },
usePointStyle: true,
boxWidth: 0,
padding: 8
}
},
tooltip: {
backgroundColor: 'rgba(0,20,50,0.92)',
titleColor: '#4caf50',
bodyColor: '#ffffff',
borderColor: 'rgba(76,175,80,0.3)',
borderWidth: 1,
padding: 8,
titleFont: { size: 11 },
bodyFont: { size: 11 },
callbacks: {
label: ctx => ` ${ctx.parsed.y.toFixed(1)} km/h`
}
}
},
scales: {
x: {
ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 }, maxRotation: 0 },
grid: { color: 'rgba(255,255,255,0.06)' }
},
y: {
ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } },
grid: { color: 'rgba(255,255,255,0.06)' }
}
}
}
});

const sugestaoVestuario = gerarSugestaoVestuario(
mediaTemp24h,
mediaPrecip24h,
mediaVento24h
);

const sugestaoDiv = document.createElement('div');
sugestaoDiv.style.marginTop = '15px';
sugestaoDiv.style.padding = '10px';
sugestaoDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
sugestaoDiv.style.borderRadius = '8px';
sugestaoDiv.style.fontSize = '12px';
sugestaoDiv.style.textAlign = 'left';
sugestaoDiv.style.lineHeight = '1.4';
sugestaoDiv.innerHTML = `<strong style="color: #ffeb3b;">Clima:</strong> ${sugestaoVestuario}`;

const ultimoGrafico = document.querySelector('.grafico:last-child');
if (ultimoGrafico && ultimoGrafico.parentNode) {
ultimoGrafico.parentNode.appendChild(sugestaoDiv);
}
}

const messagesByTemperature = [
{
min: -Infinity,
max: 0.9,
messages: ['Frio intenso! 🥶', 'Muito frio! 🥶']
},
{
min: 1.0,
max: 10.9,
messages: ['Frio! 🧣', 'Temperatura baixa! 🧥']
},
{
min: 11.0,
max: 20.9,
messages: ['Temperatura amena! 🍃', 'Clima agradável! 🌤️']
},
{
min: 21.0,
max: 30.9,
messages: ['Clima quente! ☀️', 'Dia ensolarado! ☀️']
},
{
min: 31.0,
max: Infinity,
messages: ['Calor intenso! 🔥', 'Muito calor! 🥵']
}
];

const descricoes = {
"🧊": "Congelante",
"🥶": "Frio",
"🧥": "Fresco",
"🧣": "Suave",
"🍃": "Ameno",
"🌤️": "Temperado",
"☀️": "Quente",
"😎": "Tórrido",
"🔥": "Abrasador",
"🥵": "Intenso",
"♨️": "Extremo"
};

const emojiByTemperature = [
{ min: -Infinity, max: -0.1, emoji: "🧊" },
{ min: 0,   max: 2.9, emoji: "🥶" },
{ min: 3,   max: 5.9, emoji: "🥶" },
{ min: 6,   max: 8.9, emoji: "🧥" },
{ min: 9,   max: 11.9, emoji: "🧣" },
{ min: 12,  max: 14.9, emoji: "🍃" },
{ min: 15,  max: 17.9, emoji: "🌤️" },
{ min: 18,  max: 20.9, emoji: "☀️" },
{ min: 21,  max: 24.9, emoji: "😎" },
{ min: 25,  max: 28.9, emoji: "🔥" },
{ min: 29,  max: 32.9, emoji: "🥵" },
{ min: 33,  max: 36.9, emoji: "♨️" },
{ min: 37,  max: 100, emoji: "♨️" }
];

function getSpecialDateMessage(temperatura) {
const hoje = new Date();
const dia = hoje.getDate();
const mes = hoje.getMonth() + 1;
const anoAtual = hoje.getFullYear();

const mensagensEspeciais = {
'1-1'  : { msg: `${anoAtual} chegou! 🎉`, tipo: 'feriado' },
'28-1' : { msg: `Aniversário da Bruna! 🎂`, tipo: 'aniversario' },
'30-1' : { msg: `Marlon faz ${anoAtual - 1988} anos! 🎉`, tipo: 'aniversario' },
'7-2'  : { msg: `Clara faz ${anoAtual - 2016} anos! 🎈`, tipo: 'aniversario' },
'12-2' : { msg: `Sérgio faz ${anoAtual - 1969} anos! 🎊`, tipo: 'aniversario' },
'5-3'  : { msg: 'Baron apaga as velas! 🥳', tipo: 'aniversario' },
'9-3'  : { msg: 'Dia do seu pai! 🎁', tipo: 'aniversario' },
'23-3' : { msg: `Eduardo sopra ${anoAtual - 2003} velas! 🎂`, tipo: 'aniversario' },
'5-4'  : { msg: 'Conheceu a Cláudia! 💛', tipo: 'romantico' },
'2-5'  : { msg: `Mateus tá de parabéns! 🎉`, tipo: 'aniversario' },
'5-6'  : { msg: 'Tudo começou! 💞', tipo: 'romantico' },
'12-6' : { msg: 'Amor no ar! 💕', tipo: 'romantico' },
'5-7'  : { msg: `Débora é aniversariante! 🎂`, tipo: 'aniversario' },
'5-9'  : { msg: 'Cláudia merece festa! 🍷', tipo: 'aniversario' },
'23-10': { msg: 'Mamãe faz anos! 🌹', tipo: 'aniversario' },
'3-11' : { msg: 'Hora do vinho! 🍷', tipo: 'romantico' },
'25-11': { msg: `Morgama tá de festa! 🎈`, tipo: 'aniversario' },
'25-12': { msg: 'Natal com cheiro de paz! ✨', tipo: 'feriado' }
};

const chave = `${dia}-${mes}`;
const evento = mensagensEspeciais[chave];

if (!evento) return null;

let mensagemFinal = evento.msg;

if (temperatura !== undefined) {
const emojiInfo = emojiByTemperature.find(f => temperatura >= f.min && temperatura <= f.max);
const emojiTemp = emojiInfo ? emojiInfo.emoji : '';
const faixa = obterFaixaTemperatura(temperatura);

let sufixo = '';
if (faixa === 'frio') {
if (evento.tipo === 'aniversario') sufixo = `Agasalha e aproveita!`;
else if (evento.tipo === 'romantico') sufixo = `Tá frio, mas o amor esquenta!`;
else sufixo = `Frio, mas o dia tá especial!`;
} else if (faixa === 'fresco') {
if (evento.tipo === 'aniversario') sufixo = `Dia gostoso pra comemorar!`;
else if (evento.tipo === 'romantico') sufixo = `Dia perfeito pro romance!`;
else sufixo = `Clima ótimo pra celebrar!`;
} else if (faixa === 'agradável') {
if (evento.tipo === 'aniversario') sufixo = `Dia ideal pra celebrar!`;
else if (evento.tipo === 'romantico') sufixo = `Dia ideal pro amor!`;
else sufixo = `Dia ideal pra celebrar!`;
} else if (faixa === 'calor') {
if (evento.tipo === 'aniversario') sufixo = `Bolo no freezer!`;
else if (evento.tipo === 'romantico') sufixo = `Calorão, mas junto é bom!`;
else sufixo = `Calor, mas a data especial!`;
} else if (faixa === 'intenso') {
if (evento.tipo === 'aniversario') sufixo = `Que calorão lá fora!`;
else if (evento.tipo === 'romantico') sufixo = `Calor de dar inveja ao sol!`;
else sufixo = `Calor intenso, mas é dia de festa!`;
}

if (sufixo) mensagemFinal += ` ${sufixo}`;
}

return mensagemFinal;
}

function getTodayMinMaxTemp(weatherData) {
try {
const today = weatherData.forecast.forecast.forecastday[0];
if (today && today.day) {
return {
min: today.day.mintemp_c,
max: today.day.maxtemp_c
};
}
} catch (e) {
console.warn('Erro ao obter min/max do dia:', e);
}
return { min: null, max: null };
}

function getMessageForTemperature(temp, isInitialLoad = false) {
const especialHoje = getSpecialDateMessage(temp);
if (especialHoje) {
UI_STATE.currentTemperatureMessage = especialHoje;
return UI_STATE.currentTemperatureMessage;
}

if (isInitialLoad) {
const group = messagesByTemperature.find(
range => temp >= range.min && temp <= range.max
);

if (group) {
const randomIndex = Math.floor(Math.random() * group.messages.length);
const emojiInfo = emojiByTemperature.find(
faixa => temp >= faixa.min && temp <= faixa.max
);
const emoji = emojiInfo ? emojiInfo.emoji : '';
UI_STATE.currentTemperatureMessage = `${emoji} ${group.messages[randomIndex]}`;
} else {
UI_STATE.currentTemperatureMessage = 'Aproveite!';
}
}

return UI_STATE.currentTemperatureMessage;
}

function atualizarMensagemTemperatura(weatherData = null, temp = null) {
const messageDiv = document.getElementById(DOM_IDS.WEATHER_MESSAGE);
if (!messageDiv) return;

// Monta linha do min/max com emoji de temperatura
let minMaxLinha = '';
if (weatherData) {
const { min, max } = getTodayMinMaxTemp(weatherData);
if (min !== null && max !== null) {
const tempParaEmoji = temp !== null ? temp : (min + max) / 2;
const emojiInfo = emojiByTemperature.find(f => tempParaEmoji >= f.min && tempParaEmoji <= f.max);
const emojiTemp = emojiInfo ? emojiInfo.emoji : '🌡️';
minMaxLinha = `hoje entre ${min.toFixed(0)}° e ${max.toFixed(0)}°`;
}
}

const isDataEspecial = !!getSpecialDateMessage(temp);
const mensagemOriginal = UI_STATE.currentTemperatureMessage;

// Remove APENAS o PRIMEIRO emoji da string
const primeiroEmojiMatch = mensagemOriginal.match(/^[\p{Emoji}\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s?/u);
let mensagemSemPrimeiroEmoji = mensagemOriginal;
if (primeiroEmojiMatch) {
mensagemSemPrimeiroEmoji = mensagemOriginal.replace(primeiroEmojiMatch[0], '').trim();
}

// Garante exclamação
let texto = mensagemSemPrimeiroEmoji.replace(/[!?.]+$/, '');
if (!texto.includes('!')) texto = texto + '!';

if (isDataEspecial) {
// Data especial: linha 1 = comemoração, linha 2 = clima + min/max
messageDiv.innerHTML = texto + (minMaxLinha ? `<br><span style="margin-top:8px;display:block;">🌡️ ${minMaxLinha}</span>` : '');
} else {
// Dia normal: tudo numa linha (igual ao print)
messageDiv.innerHTML = texto + (minMaxLinha ? ` ${minMaxLinha}` : '');
}
}

async function fetchAllWeatherData(lat, lon, forceRefresh = false) {
const now = Date.now();
const cacheKey = `weather_${lat}_${lon}`;

let cachedData = null;

if (!forceRefresh) {
cachedData = lerCache(cacheKey);
if (cachedData) {
UI_STATE.weatherCache = cachedData;

// ✅ ADICIONADO: Usar cache imediato se existir
console.log('⚡ Usando cache imediato para velocidade');
return cachedData;
}
}

try {
if (!navigator.onLine) {
throw new Error("Sem conexão com a internet");
}

// Prova de conectividade desativada — API chamada diretamente sem proxy

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10000);

const [current, forecast, astronomy] = await Promise.all([
getCurrentWeather(lat, lon, controller.signal),
getForecast(lat, lon, 2),
getAstronomy(lat, lon, 'today', controller.signal)
]);

clearTimeout(timeout);

const data = {
current: current || {},
forecast: forecast || { forecast: { forecastday: [] } },
astronomy: astronomy || {}
};

if (data.current.temp_c === undefined && (!data.forecast.forecast || !data.forecast.forecast.forecastday)) {
throw new Error("Dados insuficientes da API");
}

UI_STATE.weatherCache = data;
salvarCache(cacheKey, data, 60); // 60 min: sobrevive a noite e redes instáveis

return data;

} catch (error) {
console.error("Erro ao buscar dados:", error.message || error);

if (!cachedData) {
cachedData = lerCache(cacheKey);
}

if (cachedData) {
console.warn("⚠️ Usando dados em cache devido ao erro");
return cachedData;
}

// Propaga o erro para o chamador mostrar mensagem adequada (nunca exibir zeros)
throw error;
}
}

async function getCurrentWeather(lat, lon, signal) {
try {
const response = await fetch(
`https://api.weatherapi.com/v1/current.json?key=6dfcee75db614193a74140421260406&q=${lat},${lon}&lang=pt`,
{ signal }
);

if (!response.ok) {
throw new Error(`HTTP error ${response.status}`);
}

const contentType = response.headers.get("content-type");
if (!contentType || !contentType.includes("application/json")) {
const text = await response.text();
throw new Error("Resposta não é JSON. Conteúdo recebido: " + text.substring(0, 100));
}

const data = await response.json();
return data.error ? null : data.current;
} catch (error) {
console.error("Erro ao obter clima atual:", error.message);
return null;
}
}

async function getForecast(lat, lon, days = 2) {
try {
const response = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=6dfcee75db614193a74140421260406&q=${lat},${lon}&days=${days}&lang=pt`);

if (!response.ok) {
throw new Error(`HTTP error! status: ${response.status}`);
}

const data = await response.json();

if (data.error) {
throw new Error(data.error);
}

return data;
} catch (error) {
console.error('Erro ao obter previsão:', error, error.message);
return null;
}
}

async function getAstronomy(lat, lon, date = 'today') {
try {
const response = await fetch(`https://api.weatherapi.com/v1/astronomy.json?key=6dfcee75db614193a74140421260406&q=${lat},${lon}&dt=${date}`);
const data = await response.json();

if (data.error) {
throw new Error(data.error);
}

// WeatherAPI retorna { astronomy: { astro: { moon_phase, moon_illumination, ... } } }
// Retorna o astro achatado para manter compatibilidade com o restante do código
return data?.astronomy?.astro || {};
} catch (error) {
console.error('Erro ao obter dados astronômicos:', error);
return null;
}
}

function getWeatherIcon(code, isDay) {
const basePath = 'https://cdn.weatherapi.com/weather/64x64';
const time = isDay ? 'day' : 'night';
const iconMap = {
'1000': `${time}/113.png`,
'1003': `${time}/116.png`,
'1006': `${time}/119.png`,
'1009': `${time}/122.png`,
'1030': `${time}/143.png`,
'1063': `${time}/176.png`,
'1066': `${time}/179.png`,
'1069': `${time}/182.png`,
'1072': `${time}/185.png`,
'1087': `${time}/200.png`,
'1114': `${time}/227.png`,
'1117': `${time}/230.png`,
'1135': `${time}/248.png`,
'1147': `${time}/260.png`,
'1150': `${time}/263.png`,
'1153': `${time}/266.png`,
'1168': `${time}/281.png`,
'1171': `${time}/284.png`,
'1180': `${time}/293.png`,
'1183': `${time}/296.png`,
'1186': `${time}/299.png`,
'1189': `${time}/302.png`,
'1192': `${time}/305.png`,
'1195': `${time}/308.png`,
'1198': `${time}/311.png`,
'1201': `${time}/314.png`,
'1204': `${time}/317.png`,
'1207': `${time}/320.png`,
'1210': `${time}/323.png`,
'1213': `${time}/326.png`,
'1216': `${time}/329.png`,
'1219': `${time}/332.png`,
'1222': `${time}/335.png`,
'1225': `${time}/338.png`,
'1237': `${time}/350.png`,
'1240': `${time}/353.png`,
'1243': `${time}/356.png`,
'1246': `${time}/359.png`,
'1249': `${time}/362.png`,
'1252': `${time}/365.png`,
'1255': `${time}/368.png`,
'1258': `${time}/371.png`,
'1261': `${time}/374.png`,
'1264': `${time}/377.png`,
'1273': `${time}/386.png`,
'1276': `${time}/389.png`,
'1279': `${time}/392.png`,
'1282': `${time}/395.png`,
};
return basePath + '/' + (iconMap[code] || `${time}/113.png`);
}

async function buscarPrevisaoPorGeolocalizacao(isInitialLoad = true) {
const locationDateDiv = document.getElementById('locationDate');
const resultDiv = document.getElementById('weatherResult');
const statusDiv = document.getElementById('status');

if (!navigator.geolocation) {
if(resultDiv) {
resultDiv.innerHTML = '<p style="color:#ffcfcf;">Geolocalização não suportada pelo seu navegador.</p>';
}
return;
}

if(statusDiv && isInitialLoad) {
statusDiv.innerHTML = `
<p style="color:#ccc;font-size:0.75em;">Buscando dados do tempo…</p>
<div class="progress-bar-small"><div class="progress"></div></div>
`;
}

try {
// 1. PRIMEIRO: Só GPS (rápido)
const position = await new Promise((resolve, reject) => {
const geoTimeout = setTimeout(() => reject(new Error('Timeout geolocalização')), GEO_TIMEOUT);

navigator.geolocation.getCurrentPosition(
pos => {
clearTimeout(geoTimeout);
resolve(pos);
},
err => {
clearTimeout(geoTimeout);
reject(err);
},
{ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
);
});

const lat = position.coords.latitude;
const lon = position.coords.longitude;
_coordsCache = { lat, lon }; // guarda para previsão 5 dias

// Usar coordenadas como fallback imediato (não esperar Nominatim)
let cidade = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
let bairro = '';

// Mostra localização básica imediatamente
const dias = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const hoje = new Date();
const dataFormatada = `${dias[hoje.getDay()]}, ${hoje.getDate()} de ${meses[hoje.getMonth()]}`;

if(locationDateDiv) {
locationDateDiv.innerHTML = `${cidade} 🕐 ${dataFormatada}`;
}

// 2. BUSCA DADOS DO CLIMA (prioritário)
const weatherData = await fetchAllWeatherData(lat, lon);

// 3. MOSTRA TELA IMEDIATAMENTE
verificarAlertas(weatherData);

const { current: currentWeather } = weatherData;

const iconCode = currentWeather?.condition?.code ?? 1000;
const isDay = currentWeather?.is_day ?? 1;
const temp_c = currentWeather?.temp_c ?? 0;
const humidity = currentWeather?.humidity ?? 0;
const precip_mm = currentWeather?.precip_mm ?? 0;
const wind_kph = currentWeather?.wind_kph ?? 0;
const feelslike_c = currentWeather?.feelslike_c ?? 0;
const condText = currentWeather?.condition?.text ?? 'Desconhecido';

// Mostrar sugestão de receita em background (não bloqueia)
mostrarSugestaoReceita(temp_c);

const weatherIcon = await getWeatherIcon(iconCode, isDay);

// Tela principal sempre mostra o clima atual real
const weatherIconFinal = weatherIcon;
const condTextFinal = condText;

// Pegar horários do sol
const sunrise = weatherData.astronomy?.astro?.sunrise?.replace(' AM', '').replace(' PM', '') || '--:--';
const sunset = weatherData.astronomy?.astro?.sunset?.replace(' AM', '').replace(' PM', '') || '--:--';

if (resultDiv) {
resultDiv.innerHTML = `
<div class="big-icon">
<img src="${weatherIconFinal}" class="weather-icon" alt="${condTextFinal}">
${temp_c.toFixed(1)}°C
</div>
<div class="info-inline">
<div class="info-item">
<span>💧</span>
<span class="weather-value" style="color:#ffeb3b;">${humidity}%</span>
</div>
<div class="info-item">
<span>🌧️</span>
<span class="weather-value" style="color:#ffeb3b;">${precip_mm.toFixed(1)} mm</span>
</div>
<div class="info-item">
<span>🍃</span>
<span class="weather-value" style="color:#ffeb3b;">${wind_kph.toFixed(1)} km/h</span>
</div>
<div class="info-item">
<span>🌡️</span>
<span class="weather-value" style="color:#ffeb3b;">${feelslike_c}°C</span>
</div>
</div>
`;
}

if (currentWeather && currentWeather.temp_c !== undefined) {
getMessageForTemperature(currentWeather.temp_c, isInitialLoad);
atualizarMensagemTemperatura(weatherData, currentWeather.temp_c);
}

if(statusDiv) statusDiv.innerHTML = '';

// 3b. NASCER/PÔR DO SOL — dados já disponíveis, renderiza agora (antes da splash sumir)
const sunDivImediato = document.getElementById(DOM_IDS.SUN_INFO);
if (sunDivImediato) {
const astroSol = weatherData.forecast?.forecast?.forecastday?.[0]?.astro
|| weatherData.astronomy?.astro
|| weatherData.astronomy;
const nascerStr = converterHora12para24(astroSol?.sunrise);
const porStr    = converterHora12para24(astroSol?.sunset);
const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
const [porH, porM] = porStr.split(':').map(Number);
const porMin = porH * 60 + (porM || 0);
const fraseSol = agoraMin >= porMin
? `Anoiteceu às 🌙 ${porStr} e amanhece às ☀️ ${nascerStr}`
: `Hoje amanhece às ☀️ ${nascerStr} e anoitece às 🌙 ${porStr}`;
sunDivImediato.innerHTML = `
<div class="info-inline moon-text" style="font-size: 0.62em; overflow-x: auto;">
<div class="info-item" style="display: flex; align-items: center; flex-wrap: nowrap; gap: 15px; white-space: nowrap;">
<span>${fraseSol}</span>
</div>
</div>
`;
}

// 4. DEPOIS: Carrega o resto em BACKGROUND (sem bloquear)
try {
// Buscar nome da cidade em background
const nomeCidade = await buscarNomeCidadeBackground(lat, lon);
if (nomeCidade && locationDateDiv) {
locationDateDiv.innerHTML = `${nomeCidade} 🕐 ${dataFormatada}`;
}

// Buscar extras (fase da lua, previsões)
await buscarExtras(lat, lon);
} catch(e) {
console.warn('Erro ao carregar dados extras:', e);
}

} catch (error) {
console.error('Erro ao buscar previsão:', error);
mostrarErro();
if (statusDiv) statusDiv.innerHTML = '';
} finally {
finalizarPullToRefresh?.();
if (typeof splashTimeoutId !== 'undefined') clearTimeout(splashTimeoutId);
esconderSplashSuavemente();
}
}

// NOVA FUNÇÃO AUXILIAR: Buscar nome da cidade em background
async function buscarNomeCidadeBackground(lat, lon) {
try {
const NOMINATIM_URL = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=pt-BR`;
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 8000);

const resGeo = await fetch(NOMINATIM_URL, {
headers: { 'User-Agent': NOMINATIM_USER_AGENT },
signal: controller.signal
});

clearTimeout(timeoutId);

if (!resGeo.ok) throw new Error(`HTTP ${resGeo.status}`);

const dataGeo = await resGeo.json();
const bairro = dataGeo.address?.suburb ?? dataGeo.address?.neighbourhood ?? '';
const cidade = dataGeo.address?.city ?? dataGeo.address?.town ?? dataGeo.address?.state ?? '';

if (cidade) {
return bairro ? `${bairro}, ${cidade}` : cidade;
}
} catch (e) {
console.warn('Erro ao buscar nome da cidade:', e);
}
return null;
}

function esconderSplashSuavemente() {
const splash = document.getElementById('splashScreen');
splash.style.opacity = '0';
setTimeout(() => (splash.style.display = 'none'), 500);
}










async function buscarExtras(lat, lon) {
const extrasDiv = document.getElementById('extras');
const moonDiv = document.getElementById('moonInfo');
const now = Date.now();

try {
const weatherData = UI_STATE.weatherCache;

if (!weatherData.astronomy || !weatherData.forecast) {
throw new Error("Dados astronômicos ou de previsão insuficientes.");
}

const astronomy = weatherData.astronomy;
const forecast = weatherData.forecast;

const agora24 = new Date();
const horas24 = [...forecast.forecast.forecastday[0].hour, ...(forecast.forecast.forecastday[1]?.hour || [])]
.filter(h => { const diff = (new Date(h.time) - agora24) / 3.6e6; return diff >= 0 && diff <= 24; });
const medias = {
mediaTemp:   calcularMedia(horas24.map(h => h.temp_c)),
mediaPrecip: calcularMedia(horas24.map(h => h.precip_mm)),
mediaVento:  calcularMedia(horas24.map(h => h.wind_kph))
};
const sugestaoVestuario = gerarSugestaoVestuario(
medias.mediaTemp,
medias.mediaPrecip,
medias.mediaVento
);

// ========== ORDEM CORRETA ==========

// 1. NASCER/PÔR DO SOL
const sunDiv = document.getElementById(DOM_IDS.SUN_INFO);
if (sunDiv && !sunDiv.querySelector('.info-inline')) {
const astroSol = forecast.forecast?.forecastday?.[0]?.astro || astronomy.astro || astronomy;
const nascerStr = converterHora12para24(astroSol.sunrise);
const porStr    = converterHora12para24(astroSol.sunset);
sunDiv.innerHTML = `
<div class="info-inline moon-text" style="font-size: 1.2em; overflow-x: auto; margin: 0; padding: 4px;">
<div class="info-item" style="display: flex; align-items: center; flex-wrap: nowrap; gap: 15px; white-space: nowrap; margin: 0; padding: 0;">
<span>☀️ ${nascerStr} &nbsp; &nbsp; 🌙 ${porStr}</span>
</div>
</div>
`;
}

// 2. DICAS DO CLIMA
moonDiv.innerHTML = '';
const dicasDiv = document.createElement('div');
dicasDiv.style.marginTop = '0';
dicasDiv.style.marginBottom = '0';
dicasDiv.style.padding = '4px';
dicasDiv.style.borderRadius = '8px';
dicasDiv.style.fontSize = '12px';
dicasDiv.style.textAlign = 'center';
dicasDiv.style.lineHeight = '1.4';
dicasDiv.innerHTML = `<strong style="color: #ffeb3b;">Clima:</strong> ${sugestaoVestuario}`;
moonDiv.appendChild(dicasDiv);

// 3. FASE DA LUA
const luaContainer = document.createElement('div');
moonDiv.appendChild(luaContainer);

const iluminacaoOriginal = astronomy.moon_illumination;
const iluminacaoCorrigida = iluminacaoOriginal * 1.14;
const iluminacaoValor = Math.min(100, Math.max(0, Math.round(iluminacaoCorrigida * 10) / 10));
const moonInfo = getMoonInfo(astronomy.moon_phase, iluminacaoCorrigida);

const moonHTML = `
<div class="info-inline moon-text" style="font-size: 1.2em; overflow-x: auto; margin: 0; padding: 4px;">
<div class="info-item" style="display: flex; align-items: center; flex-wrap: nowrap; gap: 15px; white-space: nowrap; margin: 0; padding: 0;">
<span>
<a href="#"
onclick="abrirStarWalkMoon(); return false;"
style="color: inherit; text-decoration: none; cursor: pointer; -webkit-tap-highlight-color: transparent;">
Lua <span class=\"moon-emoji\">${moonInfo.emoji}</span> ${moonInfo.pt}
</a>
</span>
</div>
</div>
`;

luaContainer.innerHTML = moonHTML;

// ========== PREVISÃO POR PERÍODO + AMANHÃ ==========
const hoje = forecast.forecast.forecastday[0];
const horaAtual = new Date().getHours();

const periodosNomes = [
['Manhã', 'Tarde', 'Noite', 'Aurora'],
['Tarde', 'Noite', 'Aurora', 'Manhã'],
['Noite', 'Aurora', 'Manhã', 'Tarde'],
['Aurora', 'Manhã', 'Tarde', 'Noite']
];

const conjuntoNomes = Math.floor(horaAtual / 6);
const nomesPeriodos = periodosNomes[conjuntoNomes % 4];
let periodos = [];

for (let i = 0; i < 3; i++) {
const horaInicio = (horaAtual + (i * 6)) % 24;
const horaFim = (horaInicio + 6) % 24;
const periodo = hoje.hour.filter(h => {
const hora = new Date(h.time).getHours();
return horaInicio < horaFim
? hora >= horaInicio && hora < horaFim
: hora >= horaInicio || hora < horaFim;
});

periodos.push({
nome: nomesPeriodos[i],
horas: periodo,
isDay: horaInicio >= 6 && horaInicio < 18
});
}

const tempMedia = (period) => {
if (!period || period.length === 0) return '0.0';
const temps = period.map(h => h.temp_c);
const sum = temps.reduce((a, b) => a + b, 0);
return (sum / temps.length).toFixed(1);
};

const getPeriodSymbol = (period) => {
const symbols = period.map(h => h.condition.code);
const counts = {};
symbols.forEach(s => counts[s] = (counts[s] || 0) + 1);
return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
};

let periodosHTML = '';
for (let i = 0; i < periodos.length; i++) {
const periodo = periodos[i];
const temp = tempMedia(periodo.horas);
const symbol = getPeriodSymbol(periodo.horas);

periodosHTML += `
<div class="info-item" style="display: flex; flex-direction: column; align-items: center; margin-bottom: 8px; ${i < periodos.length - 1 ? 'border-right: 1px solid #ffeb3b; padding-right: 12px;' : ''}">
<div style="display: flex; align-items: baseline; gap: 6px;">
<div style="font-weight: 600; color: #ffffff;">${periodo.nome}</div>
<div style="font-size: 1.1em; font-weight: bold; color: #ffeb3b;">${temp}°C</div>
</div>
<img src="${await getWeatherIcon(symbol, periodo.isDay)}" alt="" class="weather-icon small-weather-icon" style="margin-top: 4px;">
</div>
`;
}

const amanha = forecast.forecast.forecastday[1];
const diasSemana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const dataAtual = new Date();
const dataAmanha = new Date(dataAtual);
dataAmanha.setDate(dataAtual.getDate() + 1);

const anoAmanha = dataAmanha.getFullYear();
const mesAmanha = dataAmanha.getMonth();
const diaAmanha = dataAmanha.getDate();

const horasAmanha = amanha.hour.filter(h => {
const dataHora = new Date(h.time);
return (
dataHora.getFullYear() === anoAmanha &&
dataHora.getMonth() === mesAmanha &&
dataHora.getDate() === diaAmanha
);
});

const tempsAmanha = horasAmanha.map(h => h.temp_c);
const minAmanha = Math.min(...tempsAmanha);
const maxAmanha = Math.max(...tempsAmanha);
const iconUrl = await getWeatherIcon(amanha.day.condition.code, true);
const nomeDia = diasSemana[dataAmanha.getDay()];
const nomeDiaMinusculo = nomeDia;

const amanhaHTML = `
<div class="previsao-amanha">
<div class="info">
<div class="titulo-previsao" style="font-size: 12px;">Previsão para amanhã,&nbsp;${nomeDiaMinusculo}</div>
<div class="temp-previsao" style="font-size: 12px;">Mín: ${minAmanha.toFixed(1)}°C / Máx: ${maxAmanha.toFixed(1)}°C</div>
</div>
<div class="icon">
<img src="${iconUrl}" alt="Ícone da previsão">
</div>
</div>
`;

const htmlCompletoExtras = `
<div class="info-inline" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; text-align: center; font-size: 1.1em;">
${periodosHTML}
</div>
<div style="margin: 10px 0; padding: 0; border-top: 1px solid rgba(255, 255, 255, 0.3);"></div>
${amanhaHTML}
`;

extrasDiv.innerHTML = htmlCompletoExtras;

UI_STATE.extrasCache = {
extras: htmlCompletoExtras,
moon: ""
};
UI_STATE.extrasLastFetch = now;

} catch (e) {
console.error("Erro ao obter dados adicionais:", e);
extrasDiv.innerHTML = `
<p style="color:#ffcfcf; text-align:center;">
Erro ao carregar extras. Tentando novamente...
</p>
`;

moonDiv.innerHTML = `
<p style="color:#ffcfcf; text-align:center;">
Erro ao carregar fase da lua. Tentando novamente...
</p>
`;
}
}

function converterHora12para24(hora12) {
if (!hora12) return '--:--';
const partes = hora12.trim().split(' ');
if (partes.length < 2) return hora12;
const [time, modifier] = partes;
let [hours, minutes] = time.split(':');
hours = parseInt(hours, 10);
if (modifier.toUpperCase() === 'AM' && hours === 12) hours = 0;
if (modifier.toUpperCase() === 'PM' && hours !== 12) hours += 12;
return `${String(hours).padStart(2, '0')}:${minutes}`;
}

function getMoonInfo(moonPhase, moonIllumination) {
const phase = moonPhase.toLowerCase();
let illumination = parseFloat(moonIllumination);

if (isNaN(illumination) || illumination < 0) {
illumination = 0;
}

const formattedIllumination = illumination.toFixed(1);

if (illumination < 1 && phase.includes('waxing')) {
return {
emoji: '🌑',
pt: 'Nova (início da Crescente)',
illumination: `${formattedIllumination}%`
};
}

if (illumination < 3 && phase.includes('waning')) {
return {
emoji: '🌘',
pt: 'Minguante Final',
illumination: `${formattedIllumination}%`
};
}

const phases = {
'new': { emoji: '🌑', pt: 'Nova' },
'waxing crescent': { emoji: '🌒', pt: 'Crescente' },
'first quarter': { emoji: '🌗', pt: 'Quarto Crescente' },
'waxing gibbous': { emoji: '🌖', pt: 'Gibosa Crescente' },
'full': { emoji: '🌕', pt: 'Cheia' },
'waning gibbous': { emoji: '🌔', pt: 'Gibosa Minguante' },
'last quarter': { emoji: '🌓', pt: 'Quarto Minguante' },
'waning crescent': { emoji: '🌘', pt: 'Minguante' }
};

for (const [key, value] of Object.entries(phases)) {
if (phase.includes(key)) {
return {
emoji: value.emoji,
pt: value.pt,
illumination: `${formattedIllumination}%`
};
}
}

return {
emoji: '🌑',
pt: 'Fase desconhecida',
illumination: `${formattedIllumination}%`
};
}

function lerCache(chave) {
try {
const chaveCompleta = `${CACHE_PREFIX}${chave}`;
const item = localStorage.getItem(chaveCompleta);
if (!item) return null;

const registro = JSON.parse(item);

if (typeof registro !== 'object' || registro === null) {
localStorage.removeItem(chaveCompleta);
return null;
}

const { timestamp, expira, dados } = registro;

if (typeof timestamp !== 'number' || typeof expira !== 'number') {
localStorage.removeItem(chaveCompleta);
return null;
}

if ((Date.now() - timestamp) < expira) {
return dados;
} else {
localStorage.removeItem(chaveCompleta);
return null;
}

} catch (e) {
console.warn("Erro ao ler cache localStorage:", e);
return null;
}
}

function iniciarAtualizacaoPeriodica() {
clearInterval(intervaloAtualizacao);
intervaloAtualizacao = setInterval(() => {
buscarPrevisaoPorGeolocalizacao(false);
}, 5 * 60 * 1000);
}

let intervaloAtualizacao = null;

// Adicione no final do arquivo, antes do window.onload
document.addEventListener('visibilitychange', function() {
if (!document.hidden) {
// App voltou a ser visível
console.log('PWA voltou ao foco, verificando conexão...');

// Se não há dados e não está carregando, tenta novamente
if (!UI_STATE.weatherCache && !UI_STATE.isRefreshing) {
setTimeout(() => {
buscarPrevisaoPorGeolocalizacao(false);
}, 500);
}
}
});

// Forçar reinicialização do GPS se necessário
function reiniciarGPS() {
return new Promise((resolve, reject) => {
// "Reseta" o GPS tentando uma posição de baixa precisão primeiro
navigator.geolocation.getCurrentPosition(
(pos) => resolve(pos),
(err) => reject(err),
{ enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
);
}).then(pos => {
// Depois tenta com alta precisão
return new Promise((resolve, reject) => {
navigator.geolocation.getCurrentPosition(
resolve,
reject,
{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
);
});
});
}

window.onload = async function () {
const splashScreen = document.getElementById('splashScreen');
document.body.classList.add('loading');
let splashHidden = false;

const hideSplashScreen = () => {
if (splashHidden) return;
splashHidden = true;
if (splashScreen) {
splashScreen.style.opacity = '0';
setTimeout(() => {
splashScreen.style.display = 'none';
document.body.classList.remove('loading');
}, 500);
}
};

const isRunningInApp = () => {
return window.cordova || window.Capacitor || /CrossWalk/i.test(navigator.userAgent);
};

window.addEventListener('offline', () => {
const statusDiv = document.getElementById('status');
if (statusDiv) {
statusDiv.innerHTML = '<p style="color:#ff6f00; font-size: 15px;">Você está offline. Conecte-se à internet para atualizar os dados.</p>';
}
});

window.addEventListener('online', () => {
const statusDiv = document.getElementById('status');
if (statusDiv) {
statusDiv.innerHTML = '<p style="color:#4bc194;">Conexão restaurada. Atualizando dados...</p>';
}
buscarPrevisaoPorGeolocalizacao(false);
});

splashTimeoutId = setTimeout(() => {
const essentialDataLoaded =
UI_STATE.weatherCache !== null &&
document.getElementById('weatherResult')?.innerHTML.includes('big-icon') &&
document.getElementById('locationDate')?.innerHTML.trim() !== '';

if (!essentialDataLoaded) {
console.warn('Splash travado – tempo esgotado, forçando fechamento.');
hideSplashScreen();
mostrarErro();
} else {
hideSplashScreen();
}
}, SPLASH_TIMEOUT);

try {
await carregarTudo(true);
iniciarAtualizacaoPeriodica();
hideSplashScreen();
clearTimeout(splashTimeoutId);
} catch (error) {
console.error("Erro no carregamento:", error);
hideSplashScreen();
clearTimeout(splashTimeoutId);
if (!isRunningInApp()) {
reiniciarBuscaAutomatica();
}
}
};

async function carregarTudo(isInitialLoad = true) {
try {
const statusDiv = document.getElementById('status');
statusDiv.innerHTML = `
<p style="color: #ccc; font-size: 0.85em;">Buscando dados do tempo...</p>
<div class="progress-bar-small">
<div class="progress"></div>
</div>
`;
await buscarPrevisaoPorGeolocalizacao(isInitialLoad);
} catch (erro) {
console.error("Erro ao carregar dados:", erro);
}
}

function abrirStarWalkMoon() {
const modal = document.createElement('div');
modal.id = 'modalStarWalk';
modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000000;z-index:20000;display:flex;flex-direction:column;';

history.pushState({modal: 'StarWalk'}, '');

const header = document.createElement('div');
header.style.cssText = 'display:flex;justify-content:flex-end;padding:12px;background:#0a0a1a;';

const closeBtn = document.createElement('button');
closeBtn.textContent = 'Fechar';
closeBtn.style.cssText = 'background:transparent;border:none;color:#ffeb3b;font-size:14px;font-weight:bold;cursor:pointer;padding:12px 20px;';
closeBtn.onclick = () => {
document.body.removeChild(modal);
if (history.state && history.state.modal === 'StarWalk') {
history.back();
}
};

header.appendChild(closeBtn);

const iframe = document.createElement('iframe');
iframe.src = 'https://starwalk.space/pt/moon-calendar';
iframe.style.cssText = 'width:100%;flex:1;border:none;background:#fff;';

modal.appendChild(header);
modal.appendChild(iframe);
document.body.appendChild(modal);
}

window.addEventListener('popstate', function(event) {
const modalGraficos = document.getElementById('telaGraficos');
const modalEscalas = document.getElementById('telaEscalas');
const modalStarWalk = document.getElementById('modalStarWalk');

if (modalGraficos && modalGraficos.style.display === 'block') {
fecharModal('Graficos');
event.preventDefault();
event.stopPropagation();
} else if (modalEscalas && modalEscalas.style.display === 'block') {
fecharModal('Escalas');
event.preventDefault();
event.stopPropagation();
} else if (modalStarWalk) {
document.body.removeChild(modalStarWalk);
event.preventDefault();
event.stopPropagation();
}
});

// ============================================
// PREVISÃO 5 DIAS
// ============================================

// ============================================
// PREVISÃO 5 DIAS (com Open-Meteo - gratuita, 7 dias)
// ============================================

async function abrirTela5Dias() {
// Oculta telaGraficos sem destruir gráficos
const telaGraficos = document.getElementById('telaGraficos');
if (telaGraficos) telaGraficos.style.display = 'none';

const tela = document.getElementById('tela5Dias');
if (!tela) return;
tela.style.display = 'block';
document.body.classList.add('modal-aberto');
history.pushState({ modal: '5Dias' }, '');
setTimeout(() => { tela.style.opacity = '1'; }, 10);

const conteudo = document.getElementById('conteudo5Dias');
conteudo.innerHTML = `
<div style="text-align:center;padding:40px 20px;color:#ccc;font-size:13px;">
<div class="spinner" style="margin:0 auto 14px;"></div>
Carregando previsão...
</div>`;

try {
let forecastData;
const agora = Date.now();

// Fix: se _coordsCache ainda não está disponível, tenta extrair do weatherCache
if (!_coordsCache && UI_STATE.weatherCache) {
const loc = UI_STATE.weatherCache?.current?.location
           || UI_STATE.weatherCache?.forecast?.location;
if (loc?.lat && loc?.lon) {
_coordsCache = { lat: parseFloat(loc.lat), lon: parseFloat(loc.lon) };
console.log('_coordsCache recuperado do weatherCache:', _coordsCache);
}
}

// Fix: se ainda sem coords e sem dados, aguarda até 5s pelo carregamento
if (!_coordsCache && !_forecast5Cache && !UI_STATE.weatherCache?.forecast) {
for (let i = 0; i < 50; i++) {
await new Promise(r => setTimeout(r, 100));
if (_coordsCache || UI_STATE.weatherCache?.forecast) break;
}
// Tenta extrair coords novamente após espera
if (!_coordsCache && UI_STATE.weatherCache) {
const loc2 = UI_STATE.weatherCache?.current?.location
            || UI_STATE.weatherCache?.forecast?.location;
if (loc2?.lat && loc2?.lon) {
_coordsCache = { lat: parseFloat(loc2.lat), lon: parseFloat(loc2.lon) };
}
}
}

// Tenta cache primeiro (30 minutos)
if (_forecast5Cache && (agora - _forecast5Cache.timestamp) < 30 * 60 * 1000) {
forecastData = _forecast5Cache.data;
} else if (_coordsCache) {
// Usando Open-Meteo (gratuito, 7 dias, sem chave)
const lat = _coordsCache.lat;
const lon = _coordsCache.lon;

// Open-Meteo: daily com temperatura, vento, precipitação, ícone do tempo
const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weathercode&hourly=weathercode,precipitation&timezone=auto&forecast_days=7`;

const resp = await fetch(url);
if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

const data = await resp.json();
if (!data.daily || !data.daily.time.length) throw new Error('Sem dados');

forecastData = data;
_forecast5Cache = { data: forecastData, timestamp: agora };
} else if (UI_STATE.weatherCache?.forecast) {
// Fallback: se não tem coordenadas, tenta usar cache da WeatherAPI
forecastData = UI_STATE.weatherCache.forecast;
} else {
throw new Error('Localização não disponível');
}

renderizar5Dias(forecastData);
} catch (e) {
console.error('Erro ao carregar 5 dias:', e);
conteudo.innerHTML = `
<div style="text-align:center;padding:30px;color:#ff6f00;font-size:13px;">
Não foi possível carregar a previsão.<br>
<button onclick="abrirTela5Dias()"
style="margin-top:14px;background:none;border:1px solid #ffeb3b;color:#ffeb3b;
padding:7px 18px;border-radius:20px;cursor:pointer;font-size:12px;font-family:inherit;">
Tentar novamente
</button>
</div>`;
}
}

function fecharTela5Dias(event = null, voltarParaGraficos = false) {
if (event) {
event.preventDefault();
event.stopPropagation();
}

const tela5Dias = document.getElementById('tela5Dias');
const telaEscalas = document.getElementById('telaEscalas');
const telaGraficos = document.getElementById('telaGraficos');

if (tela5Dias) tela5Dias.style.display = 'none';

// NOVO: Se voltarParaGraficos for true, reabre os gráficos
if (voltarParaGraficos && telaGraficos) {
telaGraficos.style.display = 'block';
document.body.classList.add('modal-aberto');
setTimeout(() => {
if (typeof carregarGraficos === 'function') {
carregarGraficos();
}
}, 100);
} else {
// Comportamento original: fecha tudo
if (telaEscalas) telaEscalas.style.display = 'none';
if (telaGraficos) telaGraficos.style.display = 'none';
document.body.classList.remove('modal-aberto');
}
}

// Mapeamento de weathercode da Open-Meteo para emoji/ícone (opcional, mas consistente)
function getOpenMeteoEmoji(code) {
// Códigos WMO: https://open-meteo.com/en/docs
const map = {
0:  '☀️',    // Céu limpo
1:  '🌤️',   // Principalmente limpo
2:  '🌥️',   // Parcialmente nublado
3:  '☁️',    // Nublado / encoberto
45: '☁️',   // Nevoeiro
48: '☁️',   // Nevoeiro com gelo
51: '🌧️',   // Garoa leve
53: '🌧️',   // Garoa moderada
55: '🌧️',   // Garoa densa
56: '🌧️',   // Garoa congelante leve
57: '🌧️',   // Garoa congelante densa
61: '🌧️',   // Chuva fraca
63: '🌧️',   // Chuva moderada
65: '🌧️',   // Chuva forte
66: '🌧️',   // Chuva congelante leve
67: '🌧️',   // Chuva congelante forte
71: '🌧️',   // Neve fraca → sem ❄️ para evitar quadrado
73: '🌧️',   // Neve moderada
75: '🌧️',   // Neve forte
77: '🌧️',   // Grãos de neve
80: '🌧️',   // Pancadas de chuva fracas
81: '🌧️',   // Pancadas de chuva moderadas
82: '⛈️',   // Pancadas de chuva violentas
85: '🌧️',   // Pancadas de neve leves
86: '🌧️',   // Pancadas de neve fortes
95: '⛈️',   // Trovoada
96: '⛈️',   // Trovoada com granizo leve
99: '⛈️'    // Trovoada com granizo forte
};
return map[code] || '☁️';
}

// Retorna qual período é agora: 'aurora' | 'manha' | 'tarde' | 'noite'
function renderizar5Dias(forecastData) {
const conteudo = document.getElementById('conteudo5Dias');
if (!conteudo) return;

let dias = [];

// Detectar se veio da Open-Meteo (formato com daily.time)
if (forecastData.daily && forecastData.daily.time) {
const daily = forecastData.daily;
const times = daily.time;
const maxTemps = daily.temperature_2m_max;
const minTemps = daily.temperature_2m_min;
const precip = daily.precipitation_sum;
const vento = daily.wind_speed_10m_max;
const weatherCodes = daily.weathercode;

for (let i = 0; i < times.length; i++) {
dias.push({
date: times[i],
maxTemp: maxTemps[i],
minTemp: minTemps[i],
precip_mm: precip[i],
wind_kph: vento[i],
weatherCode: weatherCodes[i],
condition: { text: '', code: weatherCodes[i] }
});
}
} 
// Fallback para WeatherAPI
else if (forecastData?.forecast?.forecastday) {
dias = forecastData.forecast.forecastday;
} 
else if (Array.isArray(forecastData)) {
dias = forecastData;
}
else {
conteudo.innerHTML = '<div style="text-align:center;padding:20px;color:#ccc;">Formato de dados inválido.</div>';
return;
}

if (!dias.length) {
conteudo.innerHTML = '<div style="text-align:center;padding:20px;color:#ccc;">Sem dados disponíveis.</div>';
return;
}

// Dias da semana com nomes completos (sem ponto)
const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
// Usa horário local do usuário (evita bug de UTC pular dia)
const hoje = new Date().toLocaleDateString('en-CA');

// Filtra dias futuros (a partir de amanhã)
const diasFuturos = dias.filter(d => {
const dataDia = new Date(d.date + 'T12:00:00').toLocaleDateString('en-CA');
return dataDia > hoje;
});

// Pega no máximo 5 dias (amanhã + 4)
const diasParaMostrar = diasFuturos.slice(0, 5);

if (diasParaMostrar.length === 0) {
conteudo.innerHTML = '<div style="text-align:center;padding:20px;color:#ccc;">Sem previsão para os próximos dias.</div>';
return;
}

let cardsHTML = '';

// === WIDGET: CHUVA PRÓXIMAS HORAS ===
if (forecastData.hourly?.time && forecastData.hourly?.precipitation) {
const agora = new Date();
const horaAtual = agora.getHours();
const dateAtual = agora.toLocaleDateString('en-CA');

// Pega (hora atual + 8 seguintes)
const proximasHoras = [];
for (let h = horaAtual; h < horaAtual + 9; h++) {
const horaReal = h % 24;
const dateStr = h >= 24 ? new Date(agora.getTime() + 86400000).toLocaleDateString('en-CA') : dateAtual;
const timeStr = `${dateStr}T${String(horaReal).padStart(2,'0')}:00`;
const idx = forecastData.hourly.time.indexOf(timeStr);
if (idx !== -1) {
proximasHoras.push({
label: h === horaAtual ? `${horaReal}h` : `${horaReal}h`,
mm: forecastData.hourly.precipitation[idx] ?? 0
});
}
}

if (proximasHoras.length) {
const maxMm = Math.max(...proximasHoras.map(h => h.mm), 0.1);
const temChuva = proximasHoras.some(h => h.mm > 0);

const barras = proximasHoras.map(h => {
const altura = Math.round((h.mm / maxMm) * 40);
const cor = h.mm === 0 ? 'rgba(255,255,255,0.12)'
: h.mm < 2   ? '#4bc194'
: h.mm < 4   ? '#90caf9'
: h.mm < 10  ? '#1976d2'
: h.mm < 20  ? '#4527a0'
: h.mm < 50  ? '#ffcc00'
: '#ff3300';
return `
<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">
<div style="font-size:10px;color:rgba(255,255,255,0.5);">${h.mm > 0 ? h.mm.toFixed(1) : '–'}</div>
<div style="width:100%;max-width:32px;height:40px;display:flex;align-items:flex-end;">
<div style="width:100%;height:${Math.max(altura,2)}px;background:${cor};border-radius:3px 3px 0 0;transition:height 0.3s;"></div>
</div>
<div style="font-size:11px;color:rgba(255,255,255,0.7);font-weight:${h.label===`${horaAtual}h`?'700':'400'};">${h.label}</div>
</div>`;
}).join('');

function classificarChuva(mm) {
if (mm === 0)     return null;
if (mm < 2)       return '💧 Garoa';
if (mm < 4)       return '🌧️ Chuva fraca';
if (mm < 10)      return '🌧️ Chuva moderada';
if (mm < 20)      return '⛈️ Chuva forte';
if (mm < 50)      return '⛈️ Chuva muito forte';
return '💦 Torrencial';
}

const horaPico = proximasHoras.reduce((a, b) => b.mm > a.mm ? b : a);
const classePico = classificarChuva(horaPico.mm);
const labelPico = horaPico.label === `${horaAtual}h` ? 'agora' : `às ${horaPico.label}`;
const mensagem = !temChuva
? '🌤️ Sem chuva nas próximas horas'
: `${classePico} ${labelPico}`;

cardsHTML += `
<div style="margin:12px 4px 0;padding:14px 16px;background:rgba(255,255,255,0.05);border-radius:14px;">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
<span style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.7);">${mensagem}</span>
</div>
<div style="display:flex;gap:6px;align-items:flex-end;justify-content:space-around;">
${barras}
</div>
</div>

<div style="margin:8px 4px 0;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:12px;display:flex;flex-wrap:wrap;gap:8px 14px;">
<span style="display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,0.6);"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#4bc194;flex-shrink:0;"></span>Garoa 0.1–1.9mm</span>
<span style="display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,0.6);"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#90caf9;flex-shrink:0;"></span>Fraca 2–3.9mm</span>
<span style="display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,0.6);"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#1976d2;flex-shrink:0;"></span>Moderada 4–9.9mm</span>
<span style="display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,0.6);"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#4527a0;flex-shrink:0;"></span>Forte 10–19.9mm</span>
<span style="display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,0.6);"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#ffd700;flex-shrink:0;"></span> Muito forte 20–49.9mm</span>
<span style="display:flex;align-items:center;gap:5px;font-size:10px;color:rgba(255,255,255,0.6);"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#ff3300;flex-shrink:0;"></span>Torrencial mais de 50mm</span>
</div>`;
}
}

// === GRID 5 DIAS ===
cardsHTML += '<div class="cinco-dias-grid">';

for (let i = 0; i < diasParaMostrar.length; i++) {
const dia = diasParaMostrar[i];
const dataObj = new Date(dia.date + 'T12:00:00');
const dataStr = `${dataObj.getDate()}/${dataObj.getMonth() + 1}`;

let labelDia;
if (i === 0) labelDia = 'Amanhã';
else         labelDia = diasSemana[dataObj.getDay()];

const maxTemp = Math.round(dia.maxTemp ?? dia.day?.maxtemp_c ?? 0);
const minTemp = Math.round(dia.minTemp ?? dia.day?.mintemp_c ?? 0);
const ventoMedio = dia.wind_kph ?? dia.day?.maxwind_kph ?? 0;
const precipMm = dia.precip_mm ?? dia.day?.totalprecip_mm ?? 0;

let emoji = '☁️';

if (forecastData.hourly?.time && forecastData.hourly?.weathercode) {
const codes = forecastData.hourly.time
.map((t, idx) => t.startsWith(dia.date) ? forecastData.hourly.weathercode[idx] : null)
.filter(c => c !== null);

if (codes.length) {
const freq = {};
codes.forEach(c => freq[c] = (freq[c] || 0) + 1);
const maisFrequente = parseInt(Object.entries(freq).sort((a,b) => b[1]-a[1])[0][0]);
emoji = getOpenMeteoEmoji(maisFrequente);
}
} else if (dia.weatherCode !== undefined) {
emoji = getOpenMeteoEmoji(dia.weatherCode);
} else if (dia.day?.condition?.code) {
const code = dia.day.condition.code;
if (code === 1000) emoji = '☀️';
else if (code === 1003) emoji = '🌤️';
else if (code === 1006 || code === 1009) emoji = '☁️';
else if (code === 1030 || code === 1135) emoji = '☁️';
else if (code >= 1063 && code <= 1087) emoji = '🌧️';
else if (code >= 1066 && code <= 1117) emoji = '🌧️';
else if (code >= 1150 && code <= 1282) emoji = '🌧️';
else emoji = '☁️';
}

cardsHTML += `
<div class="cinco-dias-card${i === 0 ? ' cinco-dias-card--hoje' : ''}">
<div class="cinco-dias-label">${labelDia}</div>
<div class="cinco-dias-data">${dataStr}</div>
<div class="cinco-dias-emoji">${emoji}</div>
<div class="cinco-dias-max">${maxTemp}°</div>
<div class="cinco-dias-min">${minTemp}°</div>
<div class="cinco-dias-vento" style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;"><span style="font-size:0.82em;opacity:0.75;">🍃 ${ventoMedio.toFixed(1)} km/h</span><span style="font-size:0.82em;opacity:0.75;">🌧️ ${precipMm.toFixed(1)} mm</span></div>
</div>`;
}

cardsHTML += '</div>';

conteudo.innerHTML = cardsHTML;
}

// Listener de popstate para fechar modal 5 dias com botão voltar
window.addEventListener('popstate', function (event) {
const tela5Dias = document.getElementById('tela5Dias');
if (tela5Dias && tela5Dias.style.display === 'block') {
fecharTela5Dias();
event.preventDefault();
event.stopPropagation();
}
});

// ============================================
// FUNÇÕES PARA CLIMA PREDOMINANTE DO DIA
// ============================================

function getMostFrequentWeatherCode(forecastData) {
try {
const agora = new Date();
const amanha = new Date(agora);
amanha.setDate(agora.getDate() + 1);

const horasDia1 = forecastData?.forecast?.forecastday?.[0]?.hour || [];
const horasDia2 = forecastData?.forecast?.forecastday?.[1]?.hour || [];
const todasHoras = [...horasDia1, ...horasDia2];

const horasFiltradas = todasHoras.filter(h => {
if (!h?.time) return false;
const dataHora = new Date(h.time);
return dataHora >= agora && dataHora < amanha;
});

if (horasFiltradas.length === 0) return null;

const frequencia = {};
horasFiltradas.forEach(h => {
const code = h.condition?.code;
if (code !== undefined) {
frequencia[code] = (frequencia[code] || 0) + 1;
}
});

let codigoMaisFrequente = null;
let maiorFrequencia = 0;

for (const [code, count] of Object.entries(frequencia)) {
if (count > maiorFrequencia) {
maiorFrequencia = count;
codigoMaisFrequente = parseInt(code);
}
}

return codigoMaisFrequente;
} catch (e) {
console.warn('Erro ao calcular código mais frequente:', e);
return null;
}
}

function getPredominantConditionText(weatherData) {
const codigoMaisFrequente = getMostFrequentWeatherCode(weatherData.forecast);

if (codigoMaisFrequente !== null) {
const conditionMap = {
1000: 'Sol',
1003: 'Parcialmente nublado',
1006: 'Nublado',
1009: 'Encoberto',
1030: 'Nevoeiro',
1063: 'Chuva',
1066: 'Neve',
1069: 'Chuva congelante',
1072: 'Garoa',
1087: 'Trovoadas',
1135: 'Nevoeiro',
1147: 'Nevoeiro',
1150: 'Garoa',
1153: 'Garoa',
1180: 'Chuva fraca',
1183: 'Chuva',
1186: 'Chuva',
1189: 'Chuva',
1192: 'Chuva',
1195: 'Chuva forte',
1198: 'Chuva congelante',
1201: 'Chuva congelante',
1204: 'Chuva com neve',
1207: 'Chuva com neve',
1210: 'Neve',
1213: 'Neve',
1216: 'Neve',
1219: 'Neve',
1222: 'Neve',
1225: 'Neve forte',
1237: 'Granizo',
1240: 'Chuva',
1243: 'Chuva forte',
1246: 'Chuva extrema',
1249: 'Chuva congelante',
1252: 'Chuva congelante',
1255: 'Neve',
1258: 'Neve forte',
1261: 'Granizo',
1264: 'Granizo forte',
1273: 'Trovoada',
1276: 'Trovoada',
1279: 'Trovoada com neve',
1282: 'Trovoada com neve'
};
return conditionMap[codigoMaisFrequente] || 'Clima variado';
}
return weatherData.current?.condition?.text || 'Desconhecido';
}
