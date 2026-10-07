# Rette, aiuti e rimborsi (Canton Ticino)

I nidi di Lugano **non hanno una retta fissa**: le strutture pubbliche (LIS)
calcolano la retta in base al reddito e alla frequenza, quelle private applicano
tariffe proprie. Per questo il dataset non contiene prezzi — sarebbe fuorviante.

Quello che invece è pubblico e stabile sono gli **aiuti cantonali** previsti dalla
Legge per le famiglie. Questa scheda riassume la sezione «Rimborso della spesa di
collocamento» della Guida «Diventare mamma e papà» 2024 della Città di Lugano
(pagg. 47–49).

> ⚠️ Gli importi sono quelli pubblicati nella guida 2024. Verificare sempre con
> l'[Ufficio del sostegno a enti e attività per le famiglie e i giovani](https://www.ti.ch)
> (tel. +41 91 814 54 51) o presso il [Servizio assegni familiari](https://www4.ti.ch/dss/ias/prestazioni-e-contributi/scheda/p/s/dettaglio/assegni-familiari/).

## Condizione generale

L'aiuto si applica ai fruitori di **nidi d'infanzia, micro-nidi, famiglie diurne e
centri extrascolastici riconosciuti dal Cantone**, per motivi di conciliabilità tra
impegni familiari e impegni lavorativi (o di formazione).

## 1. Aiuto universale — per tutte le famiglie

Concesso a tutte le famiglie che usano una struttura riconosciuta dal Cantone:

| Frequenza | Contributo mensile |
|-----------|--------------------|
| 16–30 ore settimanali, almeno 3 settimane al mese | **CHF 100** |
| Oltre 30 ore settimanali, almeno 3 settimane al mese | **CHF 200** |
| Famiglie diurne e centri extrascolastici | 20% della retta (max CHF 200), esclusi pasti e trasporti |

## 2. Aiuto soggettivo — in base a misure sociali

| Situazione | Contributo |
|------------|-----------|
| Beneficiari **RIPAM** (riduzione premio cassa malati) | **33% della retta**, dedotto l'aiuto universale; retta massima riconosciuta CHF 1'200/mese |
| Beneficiari di **assegni di prima infanzia (API)** | Totalità della retta (esclusi pasti e trasporti), dedotti aiuto universale e aiuto RIPAM, fino a **CHF 800/mese** |

Per l'aiuto soggettivo è determinante che almeno un membro dell'unità di
riferimento del bambino benefici della riduzione RIPAM. In vigore dal
1° ottobre 2018 (RIPAM) e dal 1° gennaio 2019 (API).

## 3. Deduzione fiscale

Se entrambi i genitori lavorano, sono in formazione o senza entrate, le spese di
iscrizione al nido sono **deducibili** dall'imposta federale diretta e da quella
cantonale.

- Ufficio circondariale di tassazione, Via Balestra 16, 6900 Lugano — tel. +41 91 815 49 11

## Cosa significa per la scelta della struttura

- Un nido **privato riconosciuto dal Cantone** dà diritto al rimborso; è quindi
  importante verificare che la struttura abbia l'autorizzazione cantonale. Nel
  dataset, il campo `type` distingue `pubblico` (LIS) da `privato`, ma **non**
  registra se il privato è riconosciuto: va chiesto direttamente.
- La frequenza minima richiesta dai nidi pubblici (3 giorni o 3 mezze giornate a
  settimana) è la soglia che attiva anche l'aiuto universale.
