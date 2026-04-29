'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Grid, Card, CardHeader, CardContent, Typography, Chip, Divider,
  LinearProgress, Box, Table, TableBody, TableCell, TableHead, TableRow,
  Alert, AlertTitle, Button, CircularProgress
} from '@mui/material'
import {
  LineChart, Line, ScatterChart, Scatter, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts'
import { supabase } from '@/libs/supabaseClient'

// ─── KONSTANTA BATAS KONDISI ──────────────────────────────────────────────────
const BATAS_SUHU_MIN   = 26.0
const BATAS_SUHU_MAX   = 30.0
const BATAS_LEMBAB_MIN = 40.0
const BATAS_LEMBAB_MAX = 65.0
const LIMIT_DATA       = 500

const KONDISI_COLOR = {
  'Normal':        '#2ecc71',
  'Panas & Lembap':'#e74c3c',
  'Terlalu Panas': '#e67e22',
  'Terlalu Dingin':'#3498db',
  'Terlalu Lembap':'#9b59b6',
  'Terlalu Kering':'#f39c12',
  'Tidak Normal':  '#95a5a6',
}

// ─── HELPERS ANALITIK ─────────────────────────────────────────────────────────
const klasifikasiKondisi = (suhu, lembab) => {
  const suhuOk   = suhu   >= BATAS_SUHU_MIN && suhu   <= BATAS_SUHU_MAX
  const lembabOk = lembab >= BATAS_LEMBAB_MIN && lembab <= BATAS_LEMBAB_MAX
  if (suhuOk && lembabOk)                                  return { label: 'Normal',        color: 'success'   }
  if (suhu > BATAS_SUHU_MAX && lembab > BATAS_LEMBAB_MAX) return { label: 'Panas & Lembap', color: 'error'     }
  if (suhu > BATAS_SUHU_MAX)                               return { label: 'Terlalu Panas',  color: 'warning'   }
  if (suhu < BATAS_SUHU_MIN)                               return { label: 'Terlalu Dingin', color: 'info'      }
  if (lembab > BATAS_LEMBAB_MAX)                           return { label: 'Terlalu Lembap', color: 'secondary' }
  if (lembab < BATAS_LEMBAB_MIN)                           return { label: 'Terlalu Kering', color: 'warning'   }
  return                                                           { label: 'Tidak Normal',  color: 'default'   }
}

const getAlertMessage = (label) => ({
  'Normal':        { sev: 'success', msg: 'Kamar dalam kondisi nyaman.' },
  'Panas & Lembap':{ sev: 'error',   msg: 'Kamar panas dan lembap! Nyalakan AC dan pastikan ventilasi baik.' },
  'Terlalu Panas': { sev: 'warning', msg: 'Suhu terlalu tinggi! Nyalakan kipas atau AC.' },
  'Terlalu Dingin':{ sev: 'info',    msg: 'Suhu terlalu rendah! Tutup jendela atau tambah selimut.' },
  'Terlalu Lembap':{ sev: 'warning', msg: 'Kelembapan terlalu tinggi! Buka jendela atau gunakan dehumidifier.' },
  'Terlalu Kering':{ sev: 'warning', msg: 'Udara terlalu kering! Gunakan humidifier.' },
}[label] || { sev: 'info', msg: 'Status tidak diketahui.' })

const hitungKorelasi = (x, y) => {
  const n = x.length
  if (n < 2) return 0
  const sumX  = x.reduce((a, b) => a + b, 0)
  const sumY  = y.reduce((a, b) => a + b, 0)
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0)
  const sumX2 = x.reduce((a, b) => a + b * b, 0)
  const sumY2 = y.reduce((a, b) => a + b * b, 0)
  const num   = n * sumXY - sumX * sumY
  const den   = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2))
  return den === 0 ? 0 : num / den
}

const deteksiAnomali = (data) => {
  const iqrOutlier = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b)
    const q1  = sorted[Math.floor(sorted.length * 0.25)]
    const q3  = sorted[Math.floor(sorted.length * 0.75)]
    const iqr = q3 - q1
    return arr.map(v => v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr)
  }
  const suhuA   = iqrOutlier(data.map(d => d.suhu))
  const lembabA = iqrOutlier(data.map(d => d.kelembapan))
  return data.map((d, i) => ({ ...d, isAnomali: suhuA[i] || lembabA[i] }))
}

const regresiLinear = (values) => {
  const n     = values.length
  const xs    = values.map((_, i) => i)
  const sumX  = xs.reduce((a, b) => a + b, 0)
  const sumY  = values.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((a, x, i) => a + x * values[i], 0)
  const sumX2 = xs.reduce((a, x) => a + x * x, 0)
  const b     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX ** 2 || 1)
  const a     = (sumY - b * sumX) / n
  return { a, b }
}

const prediksiBerikutnya = (temps, lembabs, steps = 10) => {
  const { a: at, b: bt } = regresiLinear(temps)
  const { a: al, b: bl } = regresiLinear(lembabs)
  const n = temps.length
  return Array.from({ length: steps }, (_, i) => ({
    step: i + 1,
    suhu:       parseFloat((at + bt * (n + i)).toFixed(1)),
    kelembapan: parseFloat((al + bl * (n + i)).toFixed(1)),
  }))
}

const statsDesc = (arr) => {
  const sorted = [...arr].sort((a, b) => a - b)
  const n      = arr.length
  const mean   = arr.reduce((a, b) => a + b, 0) / n
  const std    = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n)
  return {
    mean: mean.toFixed(2), std: std.toFixed(2),
    min: sorted[0].toFixed(1), max: sorted[n - 1].toFixed(1),
    q1: sorted[Math.floor(n * 0.25)].toFixed(1),
    median: sorted[Math.floor(n * 0.5)].toFixed(1),
    q3: sorted[Math.floor(n * 0.75)].toFixed(1),
    count: n
  }
}

const polaPerjam = (data) => {
  const jamMap = {}
  data.forEach(d => {
    const jam = new Date(d.created_at).getHours()
    if (!jamMap[jam]) jamMap[jam] = { suhu: [], lembab: [] }
    jamMap[jam].suhu.push(d.suhu)
    jamMap[jam].lembab.push(d.kelembapan)
  })
  return Object.entries(jamMap)
    .map(([jam, v]) => ({
      jam: `${String(jam).padStart(2, '0')}:00`,
      jamNum: parseInt(jam),
      avgSuhu:   parseFloat((v.suhu.reduce((a, b) => a + b, 0) / v.suhu.length).toFixed(2)),
      avgLembab: parseFloat((v.lembab.reduce((a, b) => a + b, 0) / v.lembab.length).toFixed(2)),
    }))
    .sort((a, b) => a.jamNum - b.jamNum)
}

const buatRekomendasi = (suhuMean, lembabMean, pctAnomali, kondisiPred) => {
  const reks = []
  if (suhuMean > BATAS_SUHU_MAX)          reks.push('Suhu rata-rata terlalu tinggi. Pertimbangkan penggunaan AC atau kipas.')
  else if (suhuMean < BATAS_SUHU_MIN)     reks.push('Suhu rata-rata terlalu rendah. Pertimbangkan penggunaan pemanas ruangan.')
  else                                     reks.push('Suhu rata-rata sudah dalam zona nyaman.')
  if (lembabMean > BATAS_LEMBAB_MAX)      reks.push('Kelembapan terlalu tinggi. Dehumidifier atau ventilasi lebih baik disarankan.')
  else if (lembabMean < BATAS_LEMBAB_MIN) reks.push('Kelembapan terlalu rendah. Humidifier atau tanaman hias bisa membantu.')
  else                                     reks.push('Kelembapan sudah dalam zona nyaman.')
  if (pctAnomali > 10)                     reks.push(`Anomali cukup tinggi (${pctAnomali.toFixed(1)}%). Cek kondisi sensor atau sumber panas/dingin di kamar.`)
  if (kondisiPred !== 'Normal')            reks.push(`Prediksi kondisi berikutnya: "${kondisiPred}". Siapkan tindakan pencegahan.`)
  return reks
}

// ─── CUSTOM TOOLTIP ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5, fontSize: '0.75rem', boxShadow: 3 }}>
      {label && <Typography variant='caption' display='block' color='text.secondary' mb={0.5}>{label}</Typography>}
      {payload.map((p, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.2 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.color, flexShrink: 0 }} />
          <span>{p.name}: <strong>{p.value}</strong></span>
        </Box>
      ))}
    </Box>
  )
}

// ─── KOMPONEN UTAMA ───────────────────────────────────────────────────────────
const AIAnalysisPage = () => {
  const [loading, setLoading] = useState(true)
  const [result, setResult]   = useState(null)

  const processDataAI = (rawData) => {
    if (rawData.length < 5) return null
    const data    = [...rawData].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const temps   = data.map(d => d.suhu)
    const lembabs = data.map(d => d.kelembapan)

    const statSuhu   = statsDesc(temps)
    const statLembab = statsDesc(lembabs)

    // Anomali
    const withAnomali = deteksiAnomali(data)
    const nAnomali    = withAnomali.filter(d => d.isAnomali).length
    const pctAnomali  = nAnomali / data.length * 100

    // Klasifikasi kondisi
    const withKondisi = withAnomali.map(d => ({ ...d, kondisi: klasifikasiKondisi(d.suhu, d.kelembapan) }))

    // Distribusi kondisi
    const distKondisi = {}
    withKondisi.forEach(d => { distKondisi[d.kondisi.label] = (distKondisi[d.kondisi.label] || 0) + 1 })
    const kondisiEntries   = Object.entries(distKondisi).sort((a, b) => b[1] - a[1])
    const kondisiTerbanyak = kondisiEntries[0]?.[0] || '-'
    const pctNormal        = ((distKondisi['Normal'] || 0) / data.length * 100)

    // Pie chart data
    const pieData = kondisiEntries.map(([name, value]) => ({
      name, value,
      pct: (value / data.length * 100).toFixed(1),
      fill: KONDISI_COLOR[name] || '#95a5a6'
    }))

    // Korelasi & tren
    const korelasi = hitungKorelasi(temps, lembabs)
    const recent   = temps.slice(-5).reduce((a, b) => a + b, 0) / 5
    const previous = temps.slice(-10, -5).reduce((a, b) => a + b, 0) / 5 || recent
    const tren     = recent > previous + 0.5 ? 'Meningkat ↑' : recent < previous - 0.5 ? 'Menurun ↓' : 'Stabil →'

    // Prediksi
    const prediksi    = prediksiBerikutnya(temps, lembabs, 10)
    const pred1       = prediksi[0]
    const kondisiPred = klasifikasiKondisi(pred1.suhu, pred1.kelembapan)

    // Pola per jam
    const pola         = polaPerjam(data)
    const jamTerpanas  = pola.reduce((a, b) => b.avgSuhu > a.avgSuhu ? b : a, pola[0])
    const jamTerdingin = pola.reduce((a, b) => b.avgSuhu < a.avgSuhu ? b : a, pola[0])
    const jamTerlembap = pola.reduce((a, b) => b.avgLembab > a.avgLembab ? b : a, pola[0])

    // Status terkini
    const latest     = data[data.length - 1]
    const kondisiNow = klasifikasiKondisi(latest.suhu, latest.kelembapan)
    const alertNow   = getAlertMessage(kondisiNow.label)
    const waktuNow   = new Date(latest.created_at).toLocaleString('id-ID')

    // Rekomendasi & peak
    const rekomendasi = buatRekomendasi(parseFloat(statSuhu.mean), parseFloat(statLembab.mean), pctAnomali, kondisiPred.label)
    const peakEntry   = data.reduce((a, b) => b.suhu > a.suhu ? b : a, data[0])
    const peakTime    = new Date(peakEntry.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

    // ── Prepare chart datasets ───────────────────────────────────────────────
    const step = Math.max(1, Math.floor(data.length / 200))

    // Chart 1: Line tren
    const trendChart = data
      .filter((_, i) => i % step === 0)
      .map(d => ({
        waktu:      new Date(d.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        suhu:       d.suhu,
        kelembapan: d.kelembapan,
      }))

    // Chart 2a: Scatter anomali (suhu vs kelembapan)
    const scatterNormal  = withAnomali.filter(d => !d.isAnomali).map(d => ({ x: d.suhu, y: d.kelembapan }))
    const scatterAnomali = withAnomali.filter(d =>  d.isAnomali).map(d => ({ x: d.suhu, y: d.kelembapan }))

    // Chart 2b: Timeline anomali
    const timelineAnomali = withAnomali
      .filter((_, i) => i % step === 0)
      .map(d => ({
        waktu:   new Date(d.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        suhu:    d.suhu,
        anomali: d.isAnomali ? d.suhu : null,
      }))

    // Chart 5: Prediksi line (aktual tail + prediksi)
    const aktualTail   = data.slice(-20).map((d, i) => ({ i, suhu: d.suhu, kelembapan: d.kelembapan }))
    const predChartArr = prediksi.map((p, i) => ({ i: aktualTail.length + i, suhu: p.suhu, kelembapan: p.kelembapan }))
    const predLineData = [...aktualTail, ...predChartArr]
    const splitIdx     = aktualTail.length

    // Chart 3b: Kondisi per waktu scatter
    const kondisiTimeline = data
      .filter((_, i) => i % step === 0)
      .map(d => ({
        waktu:   new Date(d.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        suhu:    d.suhu,
        kondisi: klasifikasiKondisi(d.suhu, d.kelembapan).label,
      }))

    return {
      statSuhu, statLembab,
      nAnomali, pctAnomali,
      kondisiEntries, kondisiTerbanyak, pctNormal, pieData,
      korelasi, tren,
      prediksi, pred1, kondisiPred,
      pola, jamTerpanas, jamTerdingin, jamTerlembap,
      kondisiNow, alertNow, waktuNow, latest,
      rekomendasi, peakTime,
      totalData: data.length,
      rentangAwal:  new Date(data[0].created_at).toLocaleString('id-ID'),
      rentangAkhir: new Date(data[data.length - 1].created_at).toLocaleString('id-ID'),
      trendChart, scatterNormal, scatterAnomali,
      timelineAnomali, predLineData, splitIdx, kondisiTimeline,
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sensor_data')
      .select('suhu, kelembapan, created_at')
      .order('created_at', { ascending: false })
      .limit(LIMIT_DATA)
    if (data?.length > 0) setResult(processDataAI(data))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const StatRow = ({ label, value }) => (
    <TableRow>
      <TableCell sx={{ py: 0.5, color: 'text.secondary', fontSize: '0.8rem' }}>{label}</TableCell>
      <TableCell sx={{ py: 0.5, fontWeight: 600, fontSize: '0.85rem' }} align='right'>{value}</TableCell>
    </TableRow>
  )

  const ChartCard = ({ title, subheader, children, xs = 12, md = 12 }) => (
    <Grid item xs={xs} md={md}>
      <Card>
        <CardHeader title={title} subheader={subheader} />
        <CardContent>{children}</CardContent>
      </Card>
    </Grid>
  )

  const fmt2 = n => parseFloat(n).toFixed(2)

  return (
    <Grid container spacing={4}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Grid item xs={12} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant='h5'>Advanced AI Analysis</Typography>
          <Typography variant='body2' color='text.secondary'>
            Analisis statistik mendalam dari notebook sensor kamar (Last {LIMIT_DATA} data)
          </Typography>
        </Box>
        <Button variant='outlined' size='small' onClick={fetchData} disabled={loading}>
          {loading ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
          Refresh
        </Button>
      </Grid>

      {loading && <Grid item xs={12}><LinearProgress /></Grid>}

      {result && (
        <>
          {/* ═══ ALERT STATUS TERKINI (notebook cell 10) ════════════════════ */}
          <Grid item xs={12}>
            <Alert severity={result.alertNow.sev} variant='outlined'>
              <AlertTitle>
                Status Kamar Saat Ini —&nbsp;
                <Chip label={result.kondisiNow.label} color={result.kondisiNow.color} size='small' sx={{ ml: 0.5 }} />
              </AlertTitle>
              <Typography variant='body2'>
                <strong>Waktu:</strong> {result.waktuNow}&emsp;
                <strong>Suhu:</strong> {result.latest.suhu} °C&emsp;
                <strong>Kelembapan:</strong> {result.latest.kelembapan}%
              </Typography>
              <Typography variant='body2' sx={{ mt: 0.5 }}>⚡ {result.alertNow.msg}</Typography>
            </Alert>
          </Grid>

          {/* ═══ CHART 1 — TREN SUHU & KELEMBAPAN (notebook cell 4) ════════ */}
          <ChartCard
            title='Visualisasi Tren Suhu & Kelembapan'
            subheader={`Periode: ${result.rentangAwal} s/d ${result.rentangAkhir}`}
          >
            <ResponsiveContainer width='100%' height={280}>
              <LineChart data={result.trendChart} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
                <XAxis dataKey='waktu' tick={{ fontSize: 10 }} interval='preserveStartEnd' />
                <YAxis yAxisId='s' domain={['auto', 'auto']} tick={{ fontSize: 10 }} label={{ value: 'Suhu (°C)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <YAxis yAxisId='l' orientation='right' domain={['auto', 'auto']} tick={{ fontSize: 10 }} label={{ value: 'Kelembapan (%)', angle: 90, position: 'insideRight', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine yAxisId='s' y={BATAS_SUHU_MAX} stroke='#e74c3c' strokeDasharray='4 4' label={{ value: `Max ${BATAS_SUHU_MAX}°C`, fontSize: 9, fill: '#e74c3c' }} />
                <ReferenceLine yAxisId='s' y={BATAS_SUHU_MIN} stroke='#3498db' strokeDasharray='4 4' label={{ value: `Min ${BATAS_SUHU_MIN}°C`, fontSize: 9, fill: '#3498db' }} />
                <Line yAxisId='s' type='monotone' dataKey='suhu'       name='Suhu (°C)'      stroke='#e74c3c' dot={false} strokeWidth={2} />
                <Line yAxisId='l' type='monotone' dataKey='kelembapan' name='Kelembapan (%)' stroke='#3498db' dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ═══ CHART 2 — SCATTER ANOMALI + TIMELINE (notebook cell 5) ════ */}
          <ChartCard
            title='Deteksi Anomali — Sebaran Data (Suhu vs Kelembapan)'
            subheader={`${result.nAnomali} anomali terdeteksi dari ${result.totalData} data (${result.pctAnomali.toFixed(1)}%)`}
            xs={12} md={6}
          >
            <ResponsiveContainer width='100%' height={260}>
              <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
                <XAxis
                  dataKey='x' name='Suhu' unit='°C' type='number' domain={['auto', 'auto']}
                  tick={{ fontSize: 10 }} label={{ value: 'Suhu (°C)', position: 'insideBottom', offset: -10, fontSize: 10 }}
                />
                <YAxis
                  dataKey='y' name='Kelembapan' unit='%' type='number' domain={['auto', 'auto']}
                  tick={{ fontSize: 10 }} label={{ value: 'Kelembapan (%)', angle: -90, position: 'insideLeft', fontSize: 10 }}
                />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, fontSize: '0.75rem', boxShadow: 3 }}>
                      <div>Suhu: <strong>{payload[0]?.value}°C</strong></div>
                      <div>Kelembapan: <strong>{payload[1]?.value}%</strong></div>
                    </Box>
                  )
                }} />
                <Legend />
                <ReferenceArea
                  x1={BATAS_SUHU_MIN} x2={BATAS_SUHU_MAX}
                  y1={BATAS_LEMBAB_MIN} y2={BATAS_LEMBAB_MAX}
                  fill='#2ecc71' fillOpacity={0.08}
                  label={{ value: 'Zona Nyaman', fontSize: 10, fill: '#2ecc71' }}
                />
                <Scatter name='Normal'  data={result.scatterNormal}  fill='#5b8dee' opacity={0.65} />
                <Scatter name='Anomali' data={result.scatterAnomali} fill='#e74c3c' shape='cross'  opacity={0.9} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title='Anomali pada Timeline Suhu' subheader='Titik merah = data anomali terdeteksi' xs={12} md={6}>
            <ResponsiveContainer width='100%' height={260}>
              <LineChart data={result.timelineAnomali} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
                <XAxis dataKey='waktu' tick={{ fontSize: 10 }} interval='preserveStartEnd' />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} label={{ value: 'Suhu (°C)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type='stepAfter' dataKey='suhu'    name='Suhu'    stroke='#e8a09a' dot={false} strokeWidth={1.5} />
                <Line type='monotone'  dataKey='anomali' name='Anomali Suhu' stroke='#8B0000'
                  dot={{ r: 5, fill: '#8B0000', strokeWidth: 0 }}
                  activeDot={{ r: 7 }}
                  connectNulls={false}
                  strokeWidth={0}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ═══ CHART 3 — PIE KONDISI + SCATTER KONDISI TIMELINE (notebook cell 6) ═ */}
          <ChartCard
            title='Proporsi Kondisi Kamar'
            subheader={`Kondisi dominan: ${result.kondisiTerbanyak} — Normal ${result.pctNormal.toFixed(1)}% waktu`}
            xs={12} md={5}
          >
            <ResponsiveContainer width='100%' height={280}>
              <PieChart>
                <Pie
                  data={result.pieData}
                  dataKey='value'
                  nameKey='name'
                  cx='50%' cy='50%'
                  outerRadius={100}
                  labelLine
                  label={({ name, pct }) => `${pct}%`}
                >
                  {result.pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, name) => [`${v} data (${result.pieData.find(p => p.name === name)?.pct}%)`, name]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title='Kondisi per Waktu' subheader='Sebaran suhu diwarnai berdasarkan kondisi kamar' xs={12} md={7}>
            <ResponsiveContainer width='100%' height={280}>
              <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
                <XAxis dataKey='waktu' name='Waktu' tick={{ fontSize: 10 }} interval='preserveStartEnd' />
                <YAxis dataKey='suhu' name='Suhu' unit='°C' domain={['auto', 'auto']} tick={{ fontSize: 10 }} label={{ value: 'Suhu (°C)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  return (
                    <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1, fontSize: '0.75rem', boxShadow: 3 }}>
                      <div>Waktu: <strong>{d?.waktu}</strong></div>
                      <div>Suhu: <strong>{d?.suhu}°C</strong></div>
                      <div>Kondisi: <strong style={{ color: KONDISI_COLOR[d?.kondisi] }}>{d?.kondisi}</strong></div>
                    </Box>
                  )
                }} />
                <Legend />
                {Object.keys(KONDISI_COLOR).map(label => {
                  const pts = result.kondisiTimeline.filter(d => d.kondisi === label)
                  if (!pts.length) return null
                  return <Scatter key={label} name={label} data={pts} fill={KONDISI_COLOR[label]} opacity={0.8} />
                })}
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ═══ CHART 4 — BAR POLA PER JAM (dari buat_insight jam terpanas) ═ */}
          <ChartCard
            title='Pola Suhu & Kelembapan per Jam'
            subheader='Rata-rata nilai sensor berdasarkan jam — membantu identifikasi jam terpanas & terlembap'
          >
            <ResponsiveContainer width='100%' height={250}>
              <BarChart data={result.pola} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
                <XAxis dataKey='jam' tick={{ fontSize: 11 }} />
                <YAxis yAxisId='s' domain={['auto', 'auto']} tick={{ fontSize: 10 }} label={{ value: 'Suhu (°C)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <YAxis yAxisId='l' orientation='right' domain={['auto', 'auto']} tick={{ fontSize: 10 }} label={{ value: 'Kelembapan (%)', angle: 90, position: 'insideRight', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine yAxisId='s' y={BATAS_SUHU_MAX} stroke='#e74c3c' strokeDasharray='4 4' label={{ value: `Batas Max`, fontSize: 9, fill: '#e74c3c' }} />
                <ReferenceLine yAxisId='s' y={BATAS_SUHU_MIN} stroke='#3498db' strokeDasharray='4 4' label={{ value: `Batas Min`, fontSize: 9, fill: '#3498db' }} />
                <Bar yAxisId='s' dataKey='avgSuhu'   name='Avg Suhu (°C)'      fill='#e74c3c' opacity={0.8} radius={[4, 4, 0, 0]} />
                <Bar yAxisId='l' dataKey='avgLembab' name='Avg Kelembapan (%)'  fill='#3498db' opacity={0.8} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ═══ CHART 5 — PREDIKSI LINEAR REGRESSION (notebook cell 7) ═════ */}
          <ChartCard
            title='Prediksi Suhu — Linear Regression'
            subheader='Garis kanan dari ReferenceLine = area prediksi (OLS fit)'
            xs={12} md={6}
          >
            <ResponsiveContainer width='100%' height={260}>
              <LineChart data={result.predLineData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
                <XAxis dataKey='i' tick={false} label={{ value: 'Data Point (→ Prediksi)', position: 'insideBottom', fontSize: 10, offset: -2 }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} label={{ value: 'Suhu (°C)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine x={result.splitIdx - 0.5} stroke='#888' strokeDasharray='6 3' label={{ value: 'Sekarang', fontSize: 10, fill: '#888', position: 'insideTopLeft' }} />
                <ReferenceArea x1={result.splitIdx - 0.5} x2={result.predLineData.length - 1} fill='#e74c3c' fillOpacity={0.05} />
                <Line type='monotone' dataKey='suhu' name='Suhu (°C)' stroke='#e74c3c' dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title='Prediksi Kelembapan — Linear Regression'
            subheader='Garis kanan dari ReferenceLine = area prediksi (OLS fit)'
            xs={12} md={6}
          >
            <ResponsiveContainer width='100%' height={260}>
              <LineChart data={result.predLineData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.3} />
                <XAxis dataKey='i' tick={false} label={{ value: 'Data Point (→ Prediksi)', position: 'insideBottom', fontSize: 10, offset: -2 }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} label={{ value: 'Kelembapan (%)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine x={result.splitIdx - 0.5} stroke='#888' strokeDasharray='6 3' label={{ value: 'Sekarang', fontSize: 10, fill: '#888', position: 'insideTopLeft' }} />
                <ReferenceArea x1={result.splitIdx - 0.5} x2={result.predLineData.length - 1} fill='#3498db' fillOpacity={0.05} />
                <Line type='monotone' dataKey='kelembapan' name='Kelembapan (%)' stroke='#3498db' dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ═══ STATISTIK DESKRIPTIF ════════════════════════════════════════ */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title='Statistik Deskriptif — Suhu (°C)' subheader={`${result.totalData} pembacaan`} />
              <CardContent sx={{ pt: 0 }}>
                <Table size='small'><TableBody>
                  <StatRow label='Mean'    value={`${result.statSuhu.mean} °C`} />
                  <StatRow label='Std Dev' value={`± ${result.statSuhu.std}`} />
                  <StatRow label='Min'     value={`${result.statSuhu.min} °C`} />
                  <StatRow label='Q1'      value={`${result.statSuhu.q1} °C`} />
                  <StatRow label='Median'  value={`${result.statSuhu.median} °C`} />
                  <StatRow label='Q3'      value={`${result.statSuhu.q3} °C`} />
                  <StatRow label='Max'     value={`${result.statSuhu.max} °C`} />
                </TableBody></Table>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardHeader title='Statistik Deskriptif — Kelembapan (%)' subheader={`Periode: ${result.rentangAwal}`} />
              <CardContent sx={{ pt: 0 }}>
                <Table size='small'><TableBody>
                  <StatRow label='Mean'    value={`${result.statLembab.mean}%`} />
                  <StatRow label='Std Dev' value={`± ${result.statLembab.std}`} />
                  <StatRow label='Min'     value={`${result.statLembab.min}%`} />
                  <StatRow label='Q1'      value={`${result.statLembab.q1}%`} />
                  <StatRow label='Median'  value={`${result.statLembab.median}%`} />
                  <StatRow label='Q3'      value={`${result.statLembab.q3}%`} />
                  <StatRow label='Max'     value={`${result.statLembab.max}%`} />
                </TableBody></Table>
              </CardContent>
            </Card>
          </Grid>

          {/* ═══ INFO CARDS ══════════════════════════════════════════════════ */}
          <Grid item xs={12} md={4}>
            <Card className='bs-full'>
              <CardHeader title='Analisis Tren & Korelasi' />
              <CardContent>
                <Table size='small'><TableBody>
                  <StatRow label='Korelasi Pearson (T vs H)' value={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                      <Typography variant='body2' fontWeight={600}>{fmt2(result.korelasi)}</Typography>
                      <Chip label={Math.abs(result.korelasi) > 0.5 ? 'Kuat' : 'Lemah'} size='small'
                        color={Math.abs(result.korelasi) > 0.5 ? 'primary' : 'default'} variant='tonal' />
                    </Box>
                  } />
                  <StatRow label='Tren Suhu (5 data terakhir)' value={
                    <Typography variant='body2' fontWeight={600}
                      color={result.tren.includes('↑') ? 'error' : result.tren.includes('↓') ? 'success.main' : 'text.primary'}>
                      {result.tren}
                    </Typography>
                  } />
                  <StatRow label='Puncak Suhu Tertinggi' value={result.peakTime} />
                </TableBody></Table>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card className='bs-full'>
              <CardHeader title='Pola Per Jam' />
              <CardContent>
                <Table size='small'><TableBody>
                  <StatRow label='Jam Terpanas'  value={`${result.jamTerpanas.jam} (${result.jamTerpanas.avgSuhu.toFixed(1)} °C)`} />
                  <StatRow label='Jam Terdingin' value={`${result.jamTerdingin.jam} (${result.jamTerdingin.avgSuhu.toFixed(1)} °C)`} />
                  <StatRow label='Jam Terlembap' value={`${result.jamTerlembap.jam} (${result.jamTerlembap.avgLembab.toFixed(1)}%)`} />
                </TableBody></Table>
                <Typography variant='caption' color='text.secondary' sx={{ mt: 1, display: 'block' }}>
                  * Rata-rata per jam dari seluruh dataset
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card className='bs-full'>
              <CardHeader title='Anomali & Kondisi' />
              <CardContent>
                <Table size='small'><TableBody>
                  <StatRow label='Total Data'         value={`${result.totalData} pembacaan`} />
                  <StatRow label='Anomali Terdeteksi' value={`${result.nAnomali} (${result.pctAnomali.toFixed(1)}%)`} />
                  <StatRow label='Kondisi Dominan'    value={result.kondisiTerbanyak} />
                  <StatRow label='Waktu Normal'       value={`${result.pctNormal.toFixed(1)}%`} />
                </TableBody></Table>
              </CardContent>
            </Card>
          </Grid>

          {/* ═══ TABEL PREDIKSI ══════════════════════════════════════════════ */}
          <Grid item xs={12}>
            <Card>
              <CardHeader title='Tabel Prediksi 10 Data Berikutnya' subheader='Metode: OLS Linear Regression' />
              <CardContent>
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size='small'>
                    <TableHead>
                      <TableRow>
                        <TableCell>Step</TableCell>
                        <TableCell align='center'>Pred. Suhu (°C)</TableCell>
                        <TableCell align='center'>Pred. Kelembapan (%)</TableCell>
                        <TableCell align='center'>Kondisi Prediksi</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.prediksi.map(p => {
                        const kp = klasifikasiKondisi(p.suhu, p.kelembapan)
                        return (
                          <TableRow key={p.step} hover>
                            <TableCell>+{p.step}</TableCell>
                            <TableCell align='center'>{p.suhu}</TableCell>
                            <TableCell align='center'>{p.kelembapan}</TableCell>
                            <TableCell align='center'>
                              <Chip label={kp.label} color={kp.color} size='small' variant='tonal' />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* ═══ INSIGHT & REKOMENDASI ═══════════════════════════════════════ */}
          <Grid item xs={12}>
            <Card>
              <CardHeader title='Insight & Rekomendasi Otomatis' />
              <CardContent>
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover', mb: 2 }}>
                  <Typography variant='subtitle2' color='primary' gutterBottom>Analisa AI (Ringkasan Otomatis):</Typography>
                  <Typography variant='body2'>
                    Dari <strong>{result.totalData}</strong> data, korelasi suhu-kelembapan{' '}
                    <strong>{fmt2(result.korelasi)}</strong> ({Math.abs(result.korelasi) > 0.5 ? 'kuat' : 'lemah'}).
                    Suhu rata-rata <strong>{result.statSuhu.mean} °C</strong>, kelembapan rata-rata{' '}
                    <strong>{result.statLembab.mean}%</strong>.
                    Kondisi dominan: <strong>{result.kondisiTerbanyak}</strong> ({result.pctNormal.toFixed(1)}% normal).
                    Anomali terdeteksi: <strong>{result.nAnomali}</strong> ({result.pctAnomali.toFixed(1)}%).
                    Prediksi berikutnya:{' '}
                    <Chip label={result.kondisiPred.label} color={result.kondisiPred.color} size='small' variant='tonal' />.
                  </Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Typography variant='subtitle2' gutterBottom>Rekomendasi:</Typography>
                {result.rekomendasi.map((r, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    <Typography variant='body2' color='primary'>•</Typography>
                    <Typography variant='body2'>{r}</Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Grid>
        </>
      )}

      {!loading && !result && (
        <Grid item xs={12}>
          <Alert severity='warning'>
            Tidak ada data yang cukup untuk dianalisis. Pastikan sensor sudah mengirim data ke Supabase.
          </Alert>
        </Grid>
      )}
    </Grid>
  )
}

export default AIAnalysisPage