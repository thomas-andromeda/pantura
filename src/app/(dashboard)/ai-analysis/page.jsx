'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Grid, Card, CardHeader, CardContent, Typography, Chip, Divider,
  LinearProgress, Box, Table, TableBody, TableCell, TableHead, TableRow,
  Alert, AlertTitle, Button, CircularProgress, ToggleButtonGroup, ToggleButton,
  Tooltip as MuiTooltip
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import {
  LineChart, Line, ScatterChart, Scatter, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts'
import { supabase } from '@/libs/supabaseClient'
import { useDevice } from '@/contexts/DeviceContext'

// ─── KONSTANTA BATAS KONDISI ──────────────────────────────────────────────────
const BATAS_SUHU_MIN   = 25.0
const BATAS_SUHU_MAX   = 30.0
const BATAS_LEMBAB_MIN = 50.0
const BATAS_LEMBAB_MAX = 70.0
const LIMIT_DATA       = 2598
const fmt2 = (v) => (typeof v === 'number' ? v.toFixed(2) : '-')

// ─── KATEGORI ────────────────────────────────────────────────────────────────
const KATEGORI_MAP = {
  1: { label: 'PC & AC Mati',    short: 'PC & AC Mati',    colorKey: 'secondary', chipColor: 'default',   icon: 'ri-power-off-line' },
  2: { label: 'PC Nyala',        short: 'PC Nyala',        colorKey: 'warning',   chipColor: 'warning',   icon: 'ri-computer-line' },
  3: { label: 'PC & AC Nyala',   short: 'PC & AC Nyala',   colorKey: 'success',   chipColor: 'success',   icon: 'ri-cpu-line' },
  4: { label: 'AC Nyala',        short: 'AC Nyala',        colorKey: 'info',      chipColor: 'info',      icon: 'ri-temp-cold-line' },
}

const KONDISI_KEYS = {
  'Normal':        'success',
  'Panas & Lembap':'error',
  'Terlalu Panas': 'warning',
  'Terlalu Dingin':'info',
  'Terlalu Lembap':'secondary',
  'Terlalu Kering':'warning',
  'Tidak Normal':  'secondary',
}

const kondisiIconMap = {
  'Normal': 'ri-check-line',
  'Panas & Lembap': 'ri-fire-line',
  'Terlalu Panas': 'ri-temp-hot-line',
  'Terlalu Dingin': 'ri-temp-cold-line',
  'Terlalu Lembap': 'ri-drop-line',
  'Terlalu Kering': 'ri-sun-line',
  'Tidak Normal': 'ri-error-warning-line',
}

const kondisiColorMap = {
  'Normal': '#10B981',         // Cohesive Emerald Green
  'Panas & Lembap': '#F43F5E', // Premium Rose/Pink-Red
  'Terlalu Panas': '#F97316',  // Vivid Warm Orange
  'Terlalu Dingin': '#0EA5E9', // Sky Blue
  'Terlalu Lembap': '#8B5CF6', // Purple/Violet
  'Terlalu Kering': '#F59E0B', // Warm Amber
  'Tidak Normal': '#64748B',  // Slate Gray
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
  'Panas & Lembap':{ sev: 'error',   msg: 'Kamar panas dan lembap! Nyalakan AC.' },
  'Terlalu Panas': { sev: 'warning', msg: 'Suhu terlalu tinggi! Nyalakan kipas atau AC.' },
  'Terlalu Dingin':{ sev: 'info',    msg: 'Suhu terlalu rendah!' },
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
  if (!arr.length) return { mean:'-', std:'-', min:'-', max:'-', q1:'-', median:'-', q3:'-', count:0 }
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

// ─── REKOMENDASI KONTEKSTUAL PER KATEGORI ─────────────────────────────────────
const buatRekomendasiKategori = (suhuMean, lembabMean, pctAnomali, kondisiPred, categoryId) => {
  const reks = []
  const katInfo = KATEGORI_MAP[categoryId]
  const katLabel = katInfo ? katInfo.label : 'semua kondisi'

  // Header konteks kategori
  reks.push(`Analisis untuk mode: ${katLabel}`)

  // Suhu
  if (suhuMean > BATAS_SUHU_MAX) {
    if (categoryId === 2) reks.push('Temperatur terdeteksi tinggi saat PC aktif tanpa pendingin udara. Disarankan mengaktifkan pendingin udara untuk mencegah overheating.')
    else if (categoryId === 3) reks.push('Temperatur tetap tinggi meskipun PC dan pendingin udara aktif. Diperlukan pemeriksaan kapasitas pendinginan atau penambahan sirkulasi udara.')
    else if (categoryId === 1) reks.push('Temperatur terdeteksi tinggi meskipun seluruh perangkat nonaktif. Kondisi ini kemungkinan dipengaruhi oleh faktor lingkungan eksternal.')
    else if (categoryId === 4) reks.push('Temperatur terdeteksi tinggi meskipun pendingin udara aktif tanpa beban kerja PC. Periksa kemungkinan kebocoran udara dingin atau penurunan performa AC.')
    else reks.push('Temperatur rata-rata berada di atas batas nyaman. Disarankan pengkondisian udara lebih lanjut.')
  } else if (suhuMean < BATAS_SUHU_MIN) {
    if (categoryId === 3) reks.push('Temperatur terdeteksi rendah saat pendingin udara aktif. Disarankan menaikkan temperatur setpoint AC guna efisiensi energi.')
    else if (categoryId === 4) reks.push('Temperatur berada di bawah rentang nyaman saat beban kerja PC minim. Disarankan mengurangi intensitas pendinginan.')
    else reks.push('Temperatur rata-rata berada di bawah batas nyaman. Disarankan untuk mengurangi intensitas pendinginan.')
  } else {
    if (categoryId === 3) reks.push('Kombinasi operasional perangkat dan pendingin udara menghasilkan temperatur yang ideal. Pengaturan saat ini dinilai optimal.')
    else if (categoryId === 2) reks.push('Temperatur ruangan terjaga stabil meskipun PC aktif. Sirkulasi udara ruangan dinilai memadai.')
    else reks.push('Temperatur rata-rata berada dalam rentang zona nyaman.')
  }

  // Kelembapan
  if (lembabMean > BATAS_LEMBAB_MAX) {
    if (categoryId === 3) reks.push('Kelembapan udara terdeteksi tinggi meskipun pendingin udara aktif. Periksa fungsionalitas dehumidifikasi pada perangkat pendingin.')
    else reks.push('Kelembapan udara terdeteksi tinggi. Disarankan untuk menggunakan perangkat dehumidifier atau meningkatkan ventilasi.')
  } else if (lembabMean < BATAS_LEMBAB_MIN) {
    if (categoryId === 4 || categoryId === 3) reks.push('Operasional pendingin udara menyebabkan kelembapan turun di bawah batas nyaman (kondisi kering). Disarankan penggunaan humidifier.')
    else reks.push('Kelembapan udara berada di bawah rentang nyaman. Disarankan penambahan perangkat humidifier untuk menjaga kelembapan.')
  } else {
    reks.push('Kelembapan udara berada dalam rentang zona nyaman.')
  }

  if (pctAnomali > 10) {
    reks.push(`Tingkat anomali terdeteksi signifikan (${pctAnomali.toFixed(1)}%) pada mode ${katLabel}. Disarankan verifikasi kalibrasi sensor atau pemeriksaan fluktuasi suhu tidak wajar.`)
  }

  if (kondisiPred !== 'Normal') {
    reks.push(`Prediksi matematis mengindikasikan kecenderungan kondisi berikutnya adalah "${kondisiPred}" pada mode ${katLabel}. Langkah preventif disarankan.`)
  }

  return reks
}

// ─── CUSTOM TOOLTIP (PANTURA Design — dark bg) ───────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <Box sx={{
      bgcolor: '#1A1928',
      borderRadius: '8px',
      p: '8px 12px',
      fontSize: '12px',
      color: '#F0EFF8',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      minWidth: 140
    }}>
      {label && <Typography variant='caption' sx={{ display: 'block', color: '#9390B0', mb: 0.5, fontSize: '11px' }}>{label}</Typography>}
      {payload.map((p, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.2 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: p.color }} />
          <span style={{ color: '#F0EFF8' }}>{p.name}: <strong>{p.value}</strong></span>
        </Box>
      ))}
    </Box>
  )
}

// ─── FILTER CHIP BAR (pill-shaped) ───────────────────────────────────────────
const CategoryFilterBar = ({ activeFilter, onChange, counts, theme }) => {
  const isDark = theme.palette.mode === 'dark'
  const accent = isDark ? '#A78BFA' : '#7C3AED'
  const borderColor = isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.12)'
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <Typography variant='body2' sx={{ fontWeight: 600, fontSize: '12px', color: theme.palette.text.secondary, mr: 0.5 }}>Filter Mode:</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        <Box
          component='button'
          onClick={() => onChange('all')}
          sx={{
            border: `1px solid ${activeFilter === 'all' ? accent : borderColor}`,
            bgcolor: activeFilter === 'all' ? accent : 'transparent',
            color: activeFilter === 'all' ? '#fff' : theme.palette.text.secondary,
            borderRadius: '20px',
            px: 2, py: 0.5,
            fontSize: '13px', cursor: 'pointer',
            transition: 'all 150ms ease',
            fontFamily: 'inherit'
          }}
        >
          Semua ({counts.all})
        </Box>
        {Object.entries(KATEGORI_MAP).map(([id, info]) => {
          const isActive = activeFilter === parseInt(id)
          return (
            <Box
              key={id}
              component='button'
              onClick={() => onChange(parseInt(id))}
              sx={{
                border: `1px solid ${isActive ? accent : borderColor}`,
                bgcolor: isActive ? accent : 'transparent',
                color: isActive ? '#fff' : theme.palette.text.secondary,
                borderRadius: '20px',
                px: 2, py: 0.5,
                fontSize: '13px', cursor: 'pointer',
                transition: 'all 150ms ease',
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              <i className={info.icon} style={{ fontSize: '0.85rem' }} />
              {info.short} ({counts[id] ?? 0})
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

// ─── PROCESS DATA ─────────────────────────────────────────────────────────────
const processDataAI = (rawData, filterCategory, theme) => {
  const getThemeColor = (key) => theme.palette[key]?.main || theme.palette.secondary.main
  const filtered = filterCategory === 'all' ? rawData : rawData.filter(d => d.category_id === filterCategory)
  if (filtered.length < 5) return null
  const data    = [...filtered].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const temps   = data.map(d => d.suhu)
  const lembabs = data.map(d => d.kelembapan)
  const statSuhu   = statsDesc(temps)
  const statLembab = statsDesc(lembabs)
  const withAnomali = deteksiAnomali(data)
  const nAnomali    = withAnomali.filter(d => d.isAnomali).length
  const pctAnomali  = nAnomali / data.length * 100
  const withKondisi = withAnomali.map(d => ({ ...d, kondisi: klasifikasiKondisi(d.suhu, d.kelembapan) }))
  const distKondisi = {}
  withKondisi.forEach(d => { distKondisi[d.kondisi.label] = (distKondisi[d.kondisi.label] || 0) + 1 })
  const kondisiEntries   = Object.entries(distKondisi).sort((a, b) => b[1] - a[1])
  const pieData = kondisiEntries.map(([name, value]) => ({
    name, value,
    pct: (value / data.length * 100).toFixed(1),
    fill: kondisiColorMap[name] || '#6B6A85'
  }))
  const korelasi = hitungKorelasi(temps, lembabs)
  const prediksi    = prediksiBerikutnya(temps, lembabs, 10)
  const pred1       = prediksi[0]
  const kondisiPred = klasifikasiKondisi(pred1.suhu, pred1.kelembapan)
  const latest     = data[data.length - 1]
  const kondisiNow = klasifikasiKondisi(latest.suhu, latest.kelembapan)
  const alertNow   = getAlertMessage(kondisiNow.label)
  const waktuNow   = new Date(latest.created_at).toLocaleString('id-ID')
  const katNow     = KATEGORI_MAP[latest.category_id]
  const distKategori = {}
  rawData.forEach(d => {
    const k = d.category_id || 0
    distKategori[k] = (distKategori[k] || 0) + 1
  })
  const kategoriChartData = Object.entries(KATEGORI_MAP).map(([id, info]) => ({
    name:  info.short,
    icon:  info.icon,
    value: distKategori[parseInt(id)] || 0,
    pct:   (((distKategori[parseInt(id)] || 0) / rawData.length) * 100).toFixed(1),
    fill:  getThemeColor(info.colorKey),
  }))
  const avgPerKategori = Object.entries(KATEGORI_MAP).map(([id, info]) => {
    const subset = rawData.filter(d => d.category_id === parseInt(id))
    const avgS   = subset.length ? subset.reduce((a, b) => a + b.suhu, 0) / subset.length : 0
    const avgL   = subset.length ? subset.reduce((a, b) => a + b.kelembapan, 0) / subset.length : 0
    return {
      name:     info.short,
      icon:     info.icon,
      avgSuhu:  parseFloat(avgS.toFixed(2)),
      avgLembab:parseFloat(avgL.toFixed(2)),
      fill:     getThemeColor(info.colorKey),
      count:    subset.length,
    }
  })
  const rekomendasi = buatRekomendasiKategori(
    parseFloat(statSuhu.mean), parseFloat(statLembab.mean),
    pctAnomali, kondisiPred.label, filterCategory === 'all' ? null : filterCategory
  )
  const step = Math.max(1, Math.floor(data.length / 200))
  const trendChart = data.filter((_, i) => i % step === 0).map(d => ({
    waktu: new Date(d.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    suhu: d.suhu, kelembapan: d.kelembapan, category_id: d.category_id,
  }))
  const withAnomaliStep = Math.max(1, Math.floor(withAnomali.length / 300))
  const scatterNormal   = withAnomali.filter((d, i) => !d.isAnomali && i % withAnomaliStep === 0).map(d => ({ x: d.suhu, y: d.kelembapan }))
  const scatterAnomali  = withAnomali.filter(d => d.isAnomali).map(d => ({ x: d.suhu, y: d.kelembapan }))

  const tlStep = Math.max(1, Math.floor(data.length / 200))
  const timelineAnomali = data.filter((_, i) => i % tlStep === 0).map(d => ({
    waktu:   new Date(d.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    suhu:    d.suhu,
    anomali: deteksiAnomali([d])[0]?.isAnomali ? d.suhu : null,
  }))

  const ktStep = Math.max(1, Math.floor(data.length / 300))
  const kondisiTimeline = data.filter((_, i) => i % ktStep === 0).map((d, i) => ({
    idx:    i,
    waktu:  new Date(d.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    suhu:   d.suhu,
    kondisi:klasifikasiKondisi(d.suhu, d.kelembapan).label,
  }))

  const HIST_SAMPLE  = 40
  const histStep     = Math.max(1, Math.floor(temps.length / HIST_SAMPLE))
  const histPoints   = temps.filter((_, i) => i % histStep === 0).map((t, i) => ({
    i, suhu: t, kelembapan: lembabs[i * histStep],
  }))
  const predPoints   = prediksi.map((p, j) => ({ i: histPoints.length + j, suhu: p.suhu, kelembapan: p.kelembapan }))
  const predLineData = [...histPoints, ...predPoints]
  const splitIdx     = histPoints.length

  const pola         = polaPerjam(data)
  const jamTerpanas  = pola.length ? [...pola].sort((a, b) => b.avgSuhu   - a.avgSuhu)[0]   : { jam: '-', avgSuhu: 0 }
  const jamTerdingin = pola.length ? [...pola].sort((a, b) => a.avgSuhu   - b.avgSuhu)[0]   : { jam: '-', avgSuhu: 0 }
  const jamTerlembap = pola.length ? [...pola].sort((a, b) => b.avgLembab - a.avgLembab)[0] : { jam: '-', avgLembab: 0 }

  const last5    = temps.slice(-5)
  const trendVal = last5.length > 1 ? last5[last5.length - 1] - last5[0] : 0
  const tren     = trendVal > 0.3 ? `↑ +${trendVal.toFixed(1)} °C` : trendVal < -0.3 ? `↓ ${trendVal.toFixed(1)} °C` : '→ Stabil'

  const peakEntry = data.reduce((best, d) => d.suhu > best.suhu ? d : best, data[0])
  const peakTime  = peakEntry
    ? `${peakEntry.suhu} °C @ ${new Date(peakEntry.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
    : '-'

  const kondisiTerbanyak = kondisiEntries.length ? kondisiEntries[0][0] : '-'
  const normalCount      = distKondisi['Normal'] || 0
  const pctNormal        = data.length ? (normalCount / data.length) * 100 : 0

  return {
    statSuhu, statLembab, nAnomali, pctAnomali, pieData, korelasi,
    prediksi, kondisiPred, kondisiNow, alertNow, waktuNow, latest, katNow,
    rekomendasi, totalData: data.length,
    rentangAwal:  new Date(data[0].created_at).toLocaleString('id-ID'),
    rentangAkhir: new Date(data[data.length - 1].created_at).toLocaleString('id-ID'),
    trendChart, kategoriChartData, avgPerKategori,
    scatterNormal, scatterAnomali,
    timelineAnomali, kondisiTimeline,
    predLineData, splitIdx,
    pola, jamTerpanas, jamTerdingin, jamTerlembap,
    tren, peakTime, kondisiTerbanyak, pctNormal,
  }
}

// ─── KOMPONEN UTAMA ───────────────────────────────────────────────────────────
const AIAnalysisPage = () => {
  const theme = useTheme()
  const { activeDevice } = useDevice()
  const [loading,        setLoading]        = useState(true)
  const [rawData,        setRawData]        = useState([])
  const [activeFilter,   setActiveFilter]   = useState('all')
  const [result,         setResult]         = useState(null)
  const [categoryCounts, setCategoryCounts] = useState({ all: 0 })

  const isDark = theme.palette.mode === 'dark'
  const accent = isDark ? '#A78BFA' : '#7C3AED'
  const accentLight = isDark ? '#2D2650' : '#EDE9FF'
  const bgSecondary = isDark ? '#1A1830' : '#F5F4FE'
  const borderColor = isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.12)'
  const textSecondary = isDark ? '#9390B0' : '#6B6A85'

  const activeCatInfo = activeFilter !== 'all' ? KATEGORI_MAP[activeFilter] : null
  const activeCatColor = activeCatInfo ? (theme.palette[activeCatInfo.colorKey]?.main || theme.palette.secondary.main) : null

  const buildCounts = (data) => {
    const c = { all: data.length }
    Object.keys(KATEGORI_MAP).forEach(id => {
      c[id] = data.filter(d => d.category_id === parseInt(id)).length
    })
    return c
  }

  const fetchData = useCallback(async () => {
    if (!activeDevice?.device_token) {
      setRawData([])
      setCategoryCounts({ all: 0 })
      setResult(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sensor_data')
        .select('suhu, kelembapan, created_at, category_id')
        .eq('device_token', activeDevice.device_token)
        .order('created_at', { ascending: false })
        .limit(LIMIT_DATA)
      if (error) throw error
      if (data && data.length > 0) {
        setRawData(data)
        setCategoryCounts(buildCounts(data))
      }
    } finally {
      setLoading(false)
    }
  }, [activeDevice?.device_token])

  useEffect(() => {
    if (rawData.length > 0) {
      setResult(processDataAI(rawData, activeFilter, theme))
    }
  }, [activeFilter, rawData, theme])

  useEffect(() => { fetchData() }, [fetchData])

  const ChartCard = ({ title, subheader, children, xs = 12, md = 12 }) => (
    <Grid item xs={xs} md={md}>
      <Card sx={{
        borderRadius: '12px',
        border: `0.5px solid ${borderColor}`,
        boxShadow: 'none',
        height: '100%',
        transition: 'box-shadow 150ms ease',
        '&:hover': { boxShadow: `0 4px 20px rgba(124, 58, 237, 0.08)` }
      }}>
        <CardHeader
          title={typeof title === 'string'
            ? <Typography sx={{ fontSize: '15px', fontWeight: 500, color: 'text.primary' }}>{title}</Typography>
            : title
          }
          subheader={subheader &&
            <Typography sx={{ fontSize: '12px', color: theme.palette.text.secondary, mt: 0.3 }}>{subheader}</Typography>
          }
          sx={{ pb: 0, borderBottom: `1px solid ${borderColor}` }}
        />
        <CardContent>{children}</CardContent>
      </Card>
    </Grid>
  )

  const StatRow = ({ label, value }) => (
    <TableRow>
      <TableCell sx={{ py: 0.5, color: 'text.secondary', fontSize: '0.8rem', border: 0 }}>{label}</TableCell>
      <TableCell sx={{ py: 0.5, fontWeight: 600, fontSize: '0.85rem', border: 0 }} align='right'>{value}</TableCell>
    </TableRow>
  )

  if (!activeDevice) return null

  return (
    <Grid container spacing={4}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <Grid item xs={12} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: '20px', fontWeight: 600, color: 'text.primary' }}>AI Analysis</Typography>
          <Typography sx={{ fontSize: '12px', color: textSecondary, mt: 0.3 }}>
            {activeDevice.device_name} · Analisis {LIMIT_DATA} data terakhir
          </Typography>
        </Box>
        <Button
          onClick={fetchData}
          disabled={loading}
          size='small'
          startIcon={loading ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <i className='ri-refresh-line' />}
          sx={{
            borderRadius: '8px',
            border: `1px solid ${borderColor}`,
            color: accent,
            bgcolor: accentLight,
            textTransform: 'none',
            fontSize: '13px',
            '&:hover': { bgcolor: `${accent}20` }
          }}
        >
          Refresh
        </Button>
      </Grid>

      {/* ── FILTER KATEGORI ───────────────────────────────────────────────── */}
      <Grid item xs={12}>
        <Card sx={{ p: 2, borderRadius: '12px', border: `0.5px solid ${borderColor}`, boxShadow: 'none', bgcolor: bgSecondary }}>
          <CategoryFilterBar activeFilter={activeFilter} onChange={setActiveFilter} counts={categoryCounts} theme={theme} />
        </Card>
      </Grid>

      {loading && <Grid item xs={12}><LinearProgress /></Grid>}

      {result && (
        <>
          {/* ═══ STATUS CARD (PANTURA Design) ════════════════════════════════ */}
          <Grid item xs={12}>
            {(() => {
              const kondisiLabel = result.kondisiNow.label
              const kondisiIcon = kondisiIconMap[kondisiLabel] || 'ri-information-line'
              const kondisiColor = kondisiColorMap[kondisiLabel] || '#6B6A85'
              const katColor = result.katNow ? (theme.palette[result.katNow.colorKey]?.main || theme.palette.secondary.main) : null
              return (
                <Box sx={{
                  borderRadius: '12px',
                  border: `1px solid ${kondisiColor}30`,
                  borderLeft: `4px solid ${kondisiColor}`,
                  p: 3,
                  bgcolor: `${kondisiColor}0D`,
                  display: 'flex', alignItems: 'flex-start', gap: 3
                }}>
                  {/* Large status indicator */}
                  <Box sx={{
                    width: 48, height: 48, borderRadius: '50%',
                    bgcolor: `${kondisiColor}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <i className={kondisiIcon} style={{ fontSize: '1.5rem', color: kondisiColor }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '15px', fontWeight: 600 }}>Status Kamar Saat Ini</Typography>
                      <Chip label={result.kondisiNow.label} size='small'
                        sx={{ bgcolor: `${kondisiColor}20`, color: kondisiColor, border: `1px solid ${kondisiColor}33`, fontWeight: 600 }} />
                      {result.katNow && katColor && (
                        <Chip
                          icon={<i className={result.katNow.icon} style={{ fontSize: '0.8rem', color: katColor, marginLeft: '4px' }} />}
                          label={result.katNow.label}
                          size='small'
                          sx={{ bgcolor: `${katColor}22`, color: katColor, border: `1px solid ${katColor}44` }}
                        />
                      )}
                    </Box>
                    <Typography sx={{ fontSize: '13px', color: textSecondary, mb: 0.5 }}>
                      <strong style={{ color: 'inherit' }}>Waktu:</strong> {result.waktuNow}&emsp;
                      <strong style={{ color: 'inherit' }}>Suhu:</strong> {result.latest.suhu} °C&emsp;
                      <strong style={{ color: 'inherit' }}>Kelembapan:</strong> {result.latest.kelembapan}%
                    </Typography>
                    <Typography sx={{ fontSize: '14px', color: 'text.secondary' }}>{result.alertNow.msg}</Typography>
                  </Box>
                </Box>
              )
            })()}
          </Grid>

          {/* ═══ CHART BARU: DISTRIBUSI KATEGORI ════════════════════════════ */}
          <ChartCard
            title='Distribusi Mode Penggunaan'
            subheader='Perbandingan jumlah data per kondisi perangkat (dari seluruh data)'
            xs={12} md={6}
            sx={{ height: '100%' }}
          >
            <ResponsiveContainer width='100%' height={260}>
              <BarChart data={result.kategoriChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.05} stroke={borderColor} />
                <XAxis dataKey='name' tick={{ fontSize: 10, fill: textSecondary }} />
                <YAxis tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Jumlah Data', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <Box sx={{ bgcolor: '#1A1928', borderRadius: '8px', p: '8px 12px', fontSize: '12px', color: '#F0EFF8', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', minWidth: 140 }}>
                        <Typography variant='caption' fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#9390B0', fontSize: '11px' }}>
                          <i className={d.icon} style={{ fontSize: '0.85rem' }} />
                          {d.name}
                        </Typography>
                        <div style={{ color: '#F0EFF8' }}>Jumlah: <strong>{d.value}</strong> data</div>
                        <div style={{ color: '#F0EFF8' }}>Proporsi: <strong>{d.pct}%</strong></div>
                      </Box>
                    )
                  }}
                />
                <Bar dataKey='value' name='Jumlah Data' radius={[6, 6, 0, 0]}>
                  {result.kategoriChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Spacer agar tinggi sama dengan card kanan */}
            <Box sx={{ mt: 1, height: 32 }} />
          </ChartCard>

          {/* ═══ CHART BARU: AVG SUHU & LEMBAB PER KATEGORI ═════════════════ */}
          <ChartCard
            title='Rata-rata Suhu & Kelembapan per Mode'
            subheader='Perbandingan kondisi lingkungan antar mode perangkat'
            xs={12} md={6}
            sx={{ height: '100%' }}
          >
            <ResponsiveContainer width='100%' height={268}>
              <BarChart data={result.avgPerKategori} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.05} stroke={borderColor} />
                <XAxis dataKey='name' tick={{ fontSize: 10, fill: textSecondary }} />
                <YAxis yAxisId='s' domain={['auto', 'auto']} tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Suhu (°C)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <YAxis yAxisId='l' orientation='right' domain={['auto', 'auto']} tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Kelembapan (%)', angle: 90, position: 'insideRight', fontSize: 10 }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    return (
                      <Box sx={{ bgcolor: '#1A1928', borderRadius: '8px', p: '8px 12px', fontSize: '12px', color: '#F0EFF8', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', minWidth: 140 }}>
                        <Typography variant='caption' sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#9390B0', fontSize: '11px', fontWeight: 700 }}>
                          <i className={d.icon} style={{ fontSize: '0.85rem' }} />
                          {d.name}
                        </Typography>
                        <div style={{ color: '#F0EFF8' }}>Avg Suhu: <strong>{d.avgSuhu} °C</strong></div>
                        <div style={{ color: '#F0EFF8' }}>Avg Kelembapan: <strong>{d.avgLembab}%</strong></div>
                        <div style={{ color: '#F0EFF8' }}>Jumlah data: <strong>{d.count}</strong></div>
                      </Box>
                    )
                  }}
                />
                <Legend />
                <ReferenceArea yAxisId='s' y1={BATAS_SUHU_MAX} y2={50} fill={theme.palette.error.main} fillOpacity={0.08} />
                  
                  {/* 2. Garis yang lebih tebal dengan Label yang memiliki 'background' via dy/dx */}
                  <ReferenceLine 
                    yAxisId='s' 
                    y={BATAS_SUHU_MAX} 
                    stroke={theme.palette.error.main} 
                    strokeWidth={2}
                    strokeDasharray='3 3'
                    label={{ 
                      value: `MAX ${BATAS_SUHU_MAX}°C`, 
                      position: 'insideTopLeft', 
                      fill: theme.palette.error.main,
                      fontSize: 11,
                      fontWeight: 800 
                    }} 
                  />

                  <ReferenceLine 
                    yAxisId='s' 
                    y={BATAS_SUHU_MIN} 
                    stroke={theme.palette.info.main} 
                    strokeWidth={2}
                    strokeDasharray='3 3'
                    label={{ 
                      value: `MIN ${BATAS_SUHU_MIN}°C`, 
                      position: 'insideBottomLeft', 
                      fill: theme.palette.info.main,
                      fontSize: 11,
                      fontWeight: 800 
                    }} 
                  />
                <Bar yAxisId='s' dataKey='avgSuhu'   name='Avg Suhu (°C)'     radius={[4,4,0,0]}>
                  {result.avgPerKategori.map((entry, i) => <Cell key={i} fill={entry.fill} opacity={0.85} />)}
                </Bar>
                <Bar yAxisId='l' dataKey='avgLembab' name='Avg Kelembapan (%)' radius={[4,4,0,0]}>
                  {result.avgPerKategori.map((entry, i) => <Cell key={i} fill={entry.fill} opacity={0.45} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
              {Object.entries(KATEGORI_MAP).map(([id, info]) => {
                const color = theme.palette[info.colorKey]?.main || theme.palette.secondary.main
                return (
                  <Chip key={id} icon={<i className={info.icon} style={{ fontSize: '0.8rem', color: color, marginLeft: '4px' }} />} label={info.short} size='small'
                    sx={{ bgcolor: `${color}22`, color: color, border: `1px solid ${color}` }} />
                )
              })}
            </Box>
          </ChartCard>

          {/* ═══ CHART 1 — TREN SUHU & KELEMBAPAN ══════════════════════════ */}
          <ChartCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <span>Visualisasi Tren Suhu & Kelembapan</span>
                {activeCatInfo && (
                  <Chip
                    icon={<i className={activeCatInfo.icon} style={{ fontSize: '0.8rem', color: activeCatColor }} />}
                    label={activeCatInfo.label}
                    size='small'
                    variant='outlined'
                    sx={{ borderColor: activeCatColor, color: activeCatColor }}
                  />
                )}
              </Box>
            }
            subheader={`Periode: ${result.rentangAwal} s/d ${result.rentangAkhir} · ${result.totalData} data`}
          >
            <ResponsiveContainer width='100%' height={280}>
              <LineChart data={result.trendChart} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.05} stroke={borderColor} />
                <XAxis dataKey='waktu' tick={{ fontSize: 10, fill: textSecondary }} interval='preserveStartEnd' />
                <YAxis yAxisId='s' domain={['auto', 'auto']} tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Suhu (°C)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <YAxis yAxisId='l' orientation='right' domain={['auto', 'auto']} tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Kelembapan (%)', angle: 90, position: 'insideRight', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine yAxisId='s' y={BATAS_SUHU_MAX} stroke={theme.palette.error.main} strokeDasharray='4 4' label={{ value: `Max ${BATAS_SUHU_MAX}°C`, fontSize: 9, fill: theme.palette.error.main }} />
                <ReferenceLine yAxisId='s' y={BATAS_SUHU_MIN} stroke={theme.palette.info.main} strokeDasharray='4 4' label={{ value: `Min ${BATAS_SUHU_MIN}°C`, fontSize: 9, fill: theme.palette.info.main }} />
                <Line yAxisId='s' type='monotone' dataKey='suhu'       name='Suhu (°C)'      stroke={activeCatColor || theme.palette.primary.main} dot={false} strokeWidth={2} />
                <Line yAxisId='l' type='monotone' dataKey='kelembapan' name='Kelembapan (%)' stroke={theme.palette.info.main} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ═══ CHART 2 — SCATTER ANOMALI + TIMELINE ════════════════════ */}
          <ChartCard
            title='Deteksi Anomali — Sebaran Data (Suhu vs Kelembapan)'
            subheader={`${result.nAnomali} anomali terdeteksi dari ${result.totalData} data (${result.pctAnomali.toFixed(1)}%)`}
            xs={12} md={6}
          >
            <ResponsiveContainer width='100%' height={260}>
              <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.05} stroke={borderColor} />
                <XAxis dataKey='x' name='Suhu' unit='°C' type='number' domain={['auto', 'auto']} tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Suhu (°C)', position: 'insideBottom', offset: -10, fontSize: 10 }} />
                <YAxis dataKey='y' name='Kelembapan' unit='%' type='number' domain={['auto', 'auto']} tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Kelembapan (%)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <Box sx={{ bgcolor: '#1A1928', borderRadius: '8px', p: '8px 12px', fontSize: '12px', color: '#F0EFF8', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
                      <div style={{ color: '#F0EFF8' }}>Suhu: <strong>{payload[0]?.value}°C</strong></div>
                      <div style={{ color: '#F0EFF8' }}>Kelembapan: <strong>{payload[1]?.value}%</strong></div>
                    </Box>
                  )
                }} />
                <Legend />
                <ReferenceArea x1={BATAS_SUHU_MIN} x2={BATAS_SUHU_MAX} y1={BATAS_LEMBAB_MIN} y2={BATAS_LEMBAB_MAX} fill={theme.palette.success.main} fillOpacity={0.08} label={{ value: 'Zona Nyaman', fontSize: 10, fill: theme.palette.success.main }} />
                <Scatter name='Normal'  data={result.scatterNormal}  fill={activeCatColor || theme.palette.primary.main} opacity={0.65} />
                <Scatter name='Anomali' data={result.scatterAnomali} fill={theme.palette.error.main} shape='cross' opacity={0.9} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title='Anomali pada Timeline Suhu' subheader='Titik merah = data anomali terdeteksi' xs={12} md={6}>
            <ResponsiveContainer width='100%' height={260}>
              <LineChart data={result.timelineAnomali} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.05} stroke={borderColor} />
                <XAxis dataKey='waktu' tick={{ fontSize: 10, fill: textSecondary }} interval='preserveStartEnd' />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Suhu (°C)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type='stepAfter' dataKey='suhu'    name='Suhu'         stroke={activeCatColor || theme.palette.primary.light} dot={false} strokeWidth={1.5} />
                <Line type='monotone'  dataKey='anomali' name='Anomali Suhu' stroke={theme.palette.error.dark || '#8B0000'} dot={{ r: 5, fill: theme.palette.error.dark || '#8B0000', strokeWidth: 0 }} activeDot={{ r: 7 }} connectNulls={false} strokeWidth={0} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ═══ CHART 3 — PIE KONDISI + SCATTER TIMELINE ════════════════ */}
          <ChartCard
            title='Proporsi Kondisi Kamar'
            subheader={`Kondisi dominan: ${result.kondisiTerbanyak} — Normal ${result.pctNormal.toFixed(1)}% waktu`}
            xs={12} md={5}
          >
            <ResponsiveContainer width='100%' height={280}>
              <PieChart>
                <Pie data={result.pieData} dataKey='value' nameKey='name' cx='50%' cy='50%' outerRadius={100} labelLine label={({ name, pct }) => `${pct}%`}>
                  {result.pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip formatter={(v, name) => [`${v} data (${result.pieData.find(p => p.name === name)?.pct}%)`, name]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title='Kondisi per Waktu' subheader='Sebaran suhu diwarnai berdasarkan kondisi kamar' xs={12} md={7}>
            <ResponsiveContainer width='100%' height={280}>
              <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.05} stroke={borderColor} />
                <XAxis dataKey='idx' name='Waktu' type='number' domain={['dataMin', 'dataMax']} tickCount={8}
                  tickFormatter={(val) => { const found = result.kondisiTimeline.find(d => d.idx === val); return found ? found.waktu : '' }}
                  tick={{ fontSize: 10, fill: textSecondary }}
                />
                <YAxis dataKey='suhu' name='Suhu' unit='°C' domain={['auto', 'auto']} tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Suhu (°C)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0]?.payload
                  const kColor = kondisiColorMap[d?.kondisi] || '#6B6A85'
                  return (
                    <Box sx={{ bgcolor: '#1A1928', borderRadius: '8px', p: '8px 12px', fontSize: '12px', color: '#F0EFF8', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
                      <div style={{ color: '#9390B0', fontSize: '11px', marginBottom: 2 }}>{d?.waktu}</div>
                      <div style={{ color: '#F0EFF8' }}>Suhu: <strong>{d?.suhu}°C</strong></div>
                      <div style={{ color: '#F0EFF8' }}>Kondisi: <strong style={{ color: kColor }}>{d?.kondisi}</strong></div>
                    </Box>
                  )
                }} />
                <Legend />
                {Object.entries(KONDISI_KEYS).map(([label, colorKey]) => {
                  const pts = result.kondisiTimeline.filter(d => d.kondisi === label)
                  if (!pts.length) return null
                  const color = kondisiColorMap[label] || '#6B6A85'
                  return <Scatter key={label} name={label} data={pts} fill={color} opacity={0.8} />
                })}
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ═══ CHART 4 — BAR POLA PER JAM ══════════════════════════════ */}
          <ChartCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <span>Pola Suhu & Kelembapan per Jam</span>
                {activeCatInfo && (
                  <Chip
                    icon={<i className={activeCatInfo.icon} style={{ fontSize: '0.8rem', color: activeCatColor }} />}
                    label={activeCatInfo.label}
                    size='small'
                    variant='outlined'
                    sx={{ borderColor: activeCatColor, color: activeCatColor }}
                  />
                )}
              </Box>
            }
            subheader='Rata-rata nilai sensor berdasarkan jam'
          >
            <ResponsiveContainer width='100%' height={250}>
              <BarChart data={result.pola} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.05} stroke={borderColor} />
                <XAxis dataKey='jam' tick={{ fontSize: 11, fill: textSecondary }} />
                <YAxis yAxisId='s' domain={['auto', 'auto']} tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Suhu (°C)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <YAxis yAxisId='l' orientation='right' domain={['auto', 'auto']} tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Kelembapan (%)', angle: 90, position: 'insideRight', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine yAxisId='s' y={BATAS_SUHU_MAX} stroke={theme.palette.error.main} strokeDasharray='4 4' label={{ value: 'Batas Max', fontSize: 9, fill: theme.palette.error.main }} />
                <ReferenceLine yAxisId='s' y={BATAS_SUHU_MIN} stroke={theme.palette.info.main} strokeDasharray='4 4' label={{ value: 'Batas Min', fontSize: 9, fill: theme.palette.info.main }} />
                <Bar yAxisId='s' dataKey='avgSuhu'   name='Avg Suhu (°C)'      fill={activeCatColor || theme.palette.primary.main} opacity={0.8} radius={[4, 4, 0, 0]} />
                <Bar yAxisId='l' dataKey='avgLembab' name='Avg Kelembapan (%)'  fill={theme.palette.info.main} opacity={0.8} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ═══ CHART 5 — PREDIKSI LINEAR REGRESSION ════════════════════ */}
          <ChartCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <span>Prediksi Suhu — Linear Regression</span>
                {activeCatInfo && (
                  <Chip
                    icon={<i className={activeCatInfo.icon} style={{ fontSize: '0.8rem', color: activeCatColor }} />}
                    label={activeCatInfo.label}
                    size='small'
                    variant='outlined'
                    sx={{ borderColor: activeCatColor, color: activeCatColor }}
                  />
                )}
              </Box>
            }
            subheader='Garis kanan dari ReferenceLine = area prediksi (OLS fit)'
            xs={12} md={6}
          >
            <ResponsiveContainer width='100%' height={260}>
              <LineChart data={result.predLineData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.05} stroke={borderColor} />
                <XAxis dataKey='i' tick={false} label={{ value: 'Data Point (→ Prediksi)', position: 'insideBottom', fontSize: 10, offset: -2 }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Suhu (°C)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine x={result.splitIdx - 0.5} stroke='#888' strokeDasharray='6 3' label={{ value: 'Sekarang', fontSize: 10, fill: '#888', position: 'insideTopLeft' }} />
                <ReferenceArea x1={result.splitIdx - 0.5} x2={result.predLineData.length - 1} fill={activeCatColor || theme.palette.primary.main} fillOpacity={0.05} />
                <Line type='monotone' dataKey='suhu' name='Suhu (°C)' stroke={activeCatColor || theme.palette.primary.main} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <span>Prediksi Kelembapan — Linear Regression</span>
                {activeCatInfo && (
                  <Chip
                    icon={<i className={activeCatInfo.icon} style={{ fontSize: '0.8rem', color: activeCatColor }} />}
                    label={activeCatInfo.label}
                    size='small'
                    variant='outlined'
                    sx={{ borderColor: activeCatColor, color: activeCatColor }}
                  />
                )}
              </Box>
            }
            subheader='Garis kanan dari ReferenceLine = area prediksi (OLS fit)'
            xs={12} md={6}
          >
            <ResponsiveContainer width='100%' height={260}>
              <LineChart data={result.predLineData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' opacity={0.05} stroke={borderColor} />
                <XAxis dataKey='i' tick={false} label={{ value: 'Data Point (→ Prediksi)', position: 'insideBottom', fontSize: 10, offset: -2 }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: textSecondary }} label={{ value: 'Kelembapan (%)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <ReferenceLine x={result.splitIdx - 0.5} stroke='#888' strokeDasharray='6 3' label={{ value: 'Sekarang', fontSize: 10, fill: '#888', position: 'insideTopLeft' }} />
                <ReferenceArea x1={result.splitIdx - 0.5} x2={result.predLineData.length - 1} fill={theme.palette.info.main} fillOpacity={0.05} />
                <Line type='monotone' dataKey='kelembapan' name='Kelembapan (%)' stroke={theme.palette.info.main} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ═══ STATISTIK DESKRIPTIF ════════════════════════════════════ */}
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius: '12px', border: `0.5px solid ${borderColor}`, boxShadow: 'none', '&:hover': { boxShadow: `0 4px 20px rgba(124,58,237,0.08)` } }}>
              <CardHeader
                title={<Typography sx={{ fontSize: '15px', fontWeight: 500, color: 'text.primary' }}>Statistik Deskriptif — Suhu (°C)</Typography>}
                subheader={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: '12px', color: textSecondary }}>{result.totalData} pembacaan</Typography>
                    {activeCatInfo && (
                      <>
                        <span style={{ color: textSecondary }}>·</span>
                        <Chip
                          icon={<i className={activeCatInfo.icon} style={{ fontSize: '0.8rem', color: activeCatColor }} />}
                          label={activeCatInfo.label}
                          size='small'
                          variant='text'
                          sx={{ color: activeCatColor }}
                        />
                      </>
                    )}
                  </Box>
                }
                sx={{ pb: 0, borderBottom: `1px solid ${borderColor}` }}
              />
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
            <Card sx={{ borderRadius: '12px', border: `0.5px solid ${borderColor}`, boxShadow: 'none', '&:hover': { boxShadow: `0 4px 20px rgba(124,58,237,0.08)` } }}>
              <CardHeader
                title={<Typography sx={{ fontSize: '15px', fontWeight: 500, color: 'text.primary' }}>Statistik Deskriptif — Kelembapan (%)</Typography>}
                subheader={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: '12px', color: textSecondary }}>Periode: {result.rentangAwal}</Typography>
                    {activeCatInfo && (
                      <>
                        <span style={{ color: textSecondary }}>·</span>
                        <Chip
                          icon={<i className={activeCatInfo.icon} style={{ fontSize: '0.8rem', color: activeCatColor }} />}
                          label={activeCatInfo.label}
                          size='small'
                          variant='text'
                          sx={{ color: activeCatColor }}
                        />
                      </>
                    )}
                  </Box>
                }
                sx={{ pb: 0, borderBottom: `1px solid ${borderColor}` }}
              />
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

          {/* ═══ INFO CARDS (premium bordered) ═══════════════════════════════ */}
          <Grid item xs={12} md={4}>
            <Card className='bs-full' sx={{ borderRadius: '12px', border: `0.5px solid ${borderColor}`, boxShadow: 'none', '&:hover': { boxShadow: `0 4px 20px rgba(124,58,237,0.08)` } }}>
              <CardHeader
                title={<Typography sx={{ fontSize: '15px', fontWeight: 500, color: 'text.primary' }}>Analisis Tren & Korelasi</Typography>}
                sx={{ pb: 0, borderBottom: `1px solid ${borderColor}` }}
              />
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
            <Card className='bs-full' sx={{ borderRadius: '12px', border: `0.5px solid ${borderColor}`, boxShadow: 'none', '&:hover': { boxShadow: `0 4px 20px rgba(124,58,237,0.08)` } }}>
              <CardHeader
                title={<Typography sx={{ fontSize: '15px', fontWeight: 500, color: 'text.primary' }}>Pola Per Jam</Typography>}
                sx={{ pb: 0, borderBottom: `1px solid ${borderColor}` }}
              />
              <CardContent>
                <Table size='small'><TableBody>
                  <StatRow label='Jam Terpanas'  value={`${result.jamTerpanas.jam} (${result.jamTerpanas.avgSuhu.toFixed(1)} °C)`} />
                  <StatRow label='Jam Terdingin' value={`${result.jamTerdingin.jam} (${result.jamTerdingin.avgSuhu.toFixed(1)} °C)`} />
                  <StatRow label='Jam Terlembap' value={`${result.jamTerlembap.jam} (${result.jamTerlembap.avgLembab.toFixed(1)}%)`} />
                </TableBody></Table>
                <Typography variant='caption' color='text.secondary' sx={{ mt: 1, display: 'block' }}>
                  * Rata-rata per jam dari data {activeCatInfo ? `mode ${activeCatInfo.label}` : 'seluruh mode'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card className='bs-full' sx={{ borderRadius: '12px', border: `0.5px solid ${borderColor}`, boxShadow: 'none', '&:hover': { boxShadow: `0 4px 20px rgba(124,58,237,0.08)` } }}>
              <CardHeader
                title={<Typography sx={{ fontSize: '15px', fontWeight: 500, color: 'text.primary' }}>Anomali & Kondisi</Typography>}
                sx={{ pb: 0, borderBottom: `1px solid ${borderColor}` }}
              />
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

          {/* ═══ TABEL PREDIKSI ════════════════════════════════════════════ */}
          <Grid item xs={12}>
            <Card sx={{ borderRadius: '12px', border: `0.5px solid ${borderColor}`, boxShadow: 'none' }}>
              <CardHeader
                title={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: '15px', fontWeight: 500, color: 'text.primary' }}>Tabel Prediksi 10 Data Berikutnya</Typography>
                    {activeCatInfo && (
                      <Chip
                        icon={<i className={activeCatInfo.icon} style={{ fontSize: '0.8rem', color: activeCatColor }} />}
                        label={activeCatInfo.label}
                        size='small'
                        variant='outlined'
                        sx={{ borderColor: activeCatColor, color: activeCatColor }}
                      />
                    )}
                  </Box>
                }
                subheader={<Typography sx={{ fontSize: '12px', color: textSecondary, mt: 0.3 }}>Metode: OLS Linear Regression</Typography>}
                sx={{ pb: 0, borderBottom: `1px solid ${borderColor}` }}
              />
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

          {/* ═══ INSIGHT & REKOMENDASI (premium redesign) ═══════════════════ */}
          <Grid item xs={12}>
            <Card sx={{ borderRadius: '12px', border: `0.5px solid ${borderColor}`, boxShadow: 'none' }}>
              <CardHeader
                title={<Typography sx={{ fontSize: '15px', fontWeight: 500, color: 'text.primary' }}>Insight & Rekomendasi Otomatis</Typography>}
                subheader={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.3 }}>
                    <Typography sx={{ fontSize: '12px', color: textSecondary }}>Konteks:</Typography>
                    {activeCatInfo ? (
                      <Chip
                        icon={<i className={activeCatInfo.icon} style={{ fontSize: '0.8rem', color: activeCatColor }} />}
                        label={activeCatInfo.label}
                        size='small'
                        variant='outlined'
                        sx={{ borderColor: activeCatColor, color: activeCatColor }}
                      />
                    ) : (
                      <Typography sx={{ fontSize: '12px', color: textSecondary }}>Semua Mode Perangkat</Typography>
                    )}
                  </Box>
                }
                sx={{ pb: 0, borderBottom: `1px solid ${borderColor}` }}
              />
              <CardContent>
                {/* Ringkasan Analisa */}
                <Box sx={{ p: 2.5, borderRadius: '10px', bgcolor: `${accent}08`, border: `1px solid ${borderColor}`, mb: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <i className='ri-bar-chart-2-line' style={{ fontSize: '1rem', color: accent }} />
                    <Typography sx={{ fontSize: '14px', fontWeight: 600, color: accent }}>Analisa AI (Ringkasan Otomatis)</Typography>
                    {activeCatInfo && (
                      <Chip
                        icon={<i className={activeCatInfo.icon} style={{ fontSize: '0.8rem', color: activeCatColor }} />}
                        label={activeCatInfo.label}
                        size='small'
                        sx={{ bgcolor: `${activeCatColor}22`, color: activeCatColor, border: `1px solid ${activeCatColor}` }}
                      />
                    )}
                  </Box>
                  <Typography sx={{ fontSize: '14px', lineHeight: 1.8, color: 'text.secondary' }}>
                    Berdasarkan analisis terhadap <strong style={{ color: 'text.primary' }}>{result.totalData}</strong> dataset
                    {activeCatInfo ? ` pada operasional mode ${activeCatInfo.label}` : ''},
                    koefisien korelasi Pearson antara suhu dan kelembapan terhitung sebesar <strong>{fmt2(result.korelasi)}</strong> ({Math.abs(result.korelasi) > 0.5 ? 'korelasi kuat' : 'korelasi lemah'}).
                    Temperatur rata-rata tercatat sebesar <strong>{result.statSuhu.mean} °C</strong> dengan tingkat kelembapan rata-rata sebesar{' '}
                    <strong>{result.statLembab.mean}%</strong>.
                    Status dominan ruangan berada pada kondisi <strong>{result.kondisiTerbanyak}</strong> (dengan tingkat kestabilan normal {result.pctNormal.toFixed(1)}% dari total durasi).
                    Jumlah anomali data terdeteksi sebanyak <strong>{result.nAnomali}</strong> titik ({result.pctAnomali.toFixed(1)}%).
                    Estimasi kecenderungan kondisi berikutnya diprediksikan berada pada status{' '}
                    <Chip label={result.kondisiPred.label} color={result.kondisiPred.color} size='small' variant='tonal' />.
                  </Typography>
                </Box>

                {/* Legenda mode */}
                {activeFilter === 'all' && (
                  <Box sx={{ mb: 2.5 }}>
                    <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mb: 1 }}>
                      Mode Perangkat:
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {Object.entries(KATEGORI_MAP).map(([id, info]) => {
                        const color = theme.palette[info.colorKey]?.main || theme.palette.secondary.main
                        return (
                          <Chip
                            key={id}
                            icon={<i className={info.icon} style={{ fontSize: '0.8rem', color: color, marginLeft: '4px' }} />}
                            label={info.label}
                            size='small'
                            sx={{ bgcolor: `${color}22`, color: color, border: `1px solid ${color}` }}
                          />
                        )
                      })}
                    </Box>
                  </Box>
                )}

                <Divider sx={{ mb: 2.5, borderColor: borderColor }} />

                {/* Rekomendasi AI card */}
                <Box sx={{
                  borderRadius: '12px',
                  border: `1px solid ${borderColor}`,
                  borderLeft: `4px solid ${accent}`,
                  p: '20px 24px',
                  bgcolor: accentLight + '40',
                }}>
                  <Typography sx={{ fontSize: '15px', fontWeight: 600, color: accent, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <i className='ri-lightbulb-line' />
                    Rekomendasi AI
                  </Typography>
                  {result.rekomendasi.map((rek, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: i < result.rekomendasi.length - 1 ? 1.5 : 0 }}>
                      {i === 0 ? (
                        <Typography sx={{ fontSize: '13px', fontStyle: 'italic', color: 'text.secondary', lineHeight: 1.7 }}>{rek}</Typography>
                      ) : (
                        <>
                          <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: accent, mt: 0.9, flexShrink: 0 }} />
                          <Typography sx={{ fontSize: '14px', lineHeight: 1.7, color: 'text.primary' }}>{rek}</Typography>
                        </>
                      )}
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </>
      )}

      {!loading && !result && (
        <Grid item xs={12}>
          <Alert severity='warning'>
            {activeFilter !== 'all'
              ? `Tidak ada data yang cukup untuk mode "${KATEGORI_MAP[activeFilter]?.label}". Coba pilih filter lain atau "Semua".`
              : 'Tidak ada data yang cukup untuk dianalisis. Pastikan sensor sudah mengirim data ke Supabase.'
            }
          </Alert>
        </Grid>
      )}
    </Grid>
  )
}

export default AIAnalysisPage