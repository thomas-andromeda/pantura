'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Card from '@mui/material/Card'
import CardHeader from '@mui/material/CardHeader'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ToggleButton from '@mui/material/ToggleButton'
import OptionMenu from '@core/components/option-menu'
import CustomAvatar from '@core/components/mui/Avatar'
import { useTheme } from '@mui/material/styles'
import { supabase } from '@/libs/supabaseClient'
import { useDevice } from '@/contexts/DeviceContext'
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'

// ─── UBAH DI SINI untuk jumlah data chart ────────────────────────────────────
const DATA_LIMIT = 100

// ─── OPEN-METEO ───────────────────────────────────────────────────────────────
const fetchOutdoorTemp = async (lat, lon) => {
  try {
    const url  = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m&timezone=auto`
    const res  = await fetch(url)
    if (!res.ok) throw new Error('Open-Meteo error')
    const json = await res.json()
    return {
      suhu:       json.current?.temperature_2m       ?? null,
      kelembapan: json.current?.relative_humidity_2m ?? null,
    }
  } catch {
    return { suhu: null, kelembapan: null }
  }
}

// ─── GPS ──────────────────────────────────────────────────────────────────────
const getGpsLocation = () =>
  new Promise((resolve, reject) =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(
          p  => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
          err => reject(err),
          { timeout: 8000 }
        )
      : reject(new Error('Geolocation tidak didukung'))
  )

// ─── CUSTOM TOOLTIP (PANTURA Design) ─────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  // NOTE: isDark tidak bisa diakses di sini karena komponen ini di luar scope IoTTempMonitor
  // Gunakan warna solid yang kontras di kedua mode
  if (!active || !payload?.length) return null
  return (
    <Box sx={{
      bgcolor: '#1A1928',
      borderRadius: '8px',
      p: '8px 12px',
      fontSize: '12px',
      color: '#F0EFF8',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
    }}>
      <Typography variant='caption' sx={{ display: 'block', color: '#9390B0', mb: 0.5 }}>{label}</Typography>
      {payload.map((p, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.2 }}>
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: p.color }} />
          <span style={{ color: '#F0EFF8' }}>{p.name}: <strong>{p.value != null ? `${p.value}°C` : '—'}</strong></span>
        </Box>
      ))}
    </Box>
  )
}

const categoryModes = [
  { id: 1, label: 'PC & AC Mati', colorKey: 'secondary', icon: 'ri-power-off-line' },
  { id: 2, label: 'PC Nyala', colorKey: 'warning', icon: 'ri-computer-line' },
  { id: 3, label: 'PC & AC Nyala', colorKey: 'success', icon: 'ri-cpu-line' },
  { id: 4, label: 'AC Nyala', colorKey: 'info', icon: 'ri-temp-cold-line' }
]

// ─── KOMPONEN UTAMA ───────────────────────────────────────────────────────────
const IoTTempMonitor = () => {
  const theme = useTheme()
  const { activeDevice, updateCategoryMode } = useDevice()
  const [avgTemp,      setAvgTemp]      = useState(null)
  const [avgHum,       setAvgHum]       = useState(null)
  const [totalCount,   setTotalCount]   = useState(null)
  const [devStatus,    setDevStatus]    = useState('Checking...')
  const [outdoorTemp,  setOutdoorTemp]  = useState(null)
  const [outdoorHum,   setOutdoorHum]   = useState(null)
  const [locationName, setLocationName] = useState('')
  const [gpsStatus,    setGpsStatus]    = useState('idle') // idle | loading | ok | error
  const [chartData,    setChartData]    = useState([])
  const [chartLoading, setChartLoading] = useState(true)
  const isFirstChartLoad = useRef(true)

  // Simpan koordinat supaya tidak perlu minta GPS berulang
  const coordsRef  = useRef({ lat: null, lon: null })
  // Simpan suhu luar di ref agar fetchSensor selalu bisa akses nilai terbaru
  const outdoorRef = useRef({ suhu: null, kelembapan: null })

  // ── Cek status device ─────────────────────────────────────────────────────
  const checkStatus = (lastTime) => {
    if (!lastTime) return 'Offline'
    return (new Date() - new Date(lastTime)) / 1000 > 45 ? 'Offline' : 'Online'
  }

  // ── Fetch data sensor ─────────────────────────────────────────────────────
  const fetchSensor = useCallback(async () => {
    if (!activeDevice?.device_token) {
      setAvgTemp(null)
      setAvgHum(null)
      setTotalCount(null)
      setDevStatus('Offline')
      setChartData([])
      setChartLoading(false)
      return
    }

    try {
      // Stat cards: 10 data terbaru
      const { data: recent, error: e1, count } = await supabase
        .from('sensor_data')
        .select('*', { count: 'exact' })
        .eq('device_token', activeDevice.device_token)
        .order('created_at', { ascending: false })
        .limit(10)
      if (e1) throw e1

      if (recent && recent.length > 0) {
        const aT = recent.reduce((a, b) => a + b.suhu, 0)       / recent.length
        const aH = recent.reduce((a, b) => a + b.kelembapan, 0) / recent.length
        setAvgTemp(aT.toFixed(1))
        setAvgHum(aH.toFixed(1))
        setTotalCount(count ?? 0)
        setDevStatus(checkStatus(recent[0].created_at))
      } else {
        setAvgTemp(null)
        setAvgHum(null)
        setTotalCount(0)
        setDevStatus('Offline')
      }

      // Chart: DATA_LIMIT data, descending lalu di-reverse
      if (isFirstChartLoad.current) {
        setChartLoading(true)
      }
      const { data: raw, error: e2 } = await supabase
        .from('sensor_data')
        .select('suhu, kelembapan, created_at')
        .eq('device_token', activeDevice.device_token)
        .order('created_at', { ascending: false })
        .limit(DATA_LIMIT)
      if (e2) throw e2

      if (raw && raw.length > 0) {
        const sorted = [...raw].reverse()
        const step   = Math.max(1, Math.floor(sorted.length / 300))
        const oTemp  = outdoorRef.current.suhu

        setChartData(
          sorted
            .filter((_, i) => i % step === 0)
            .map(d => ({
              waktu:     new Date(d.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
              suhuDalam: d.suhu,
              // suhuLuar hanya diisi jika ada nilainya, biar tidak muncul null di chart
              ...(oTemp != null ? { suhuLuar: oTemp } : {}),
            }))
        )
        isFirstChartLoad.current = false
      } else {
        setChartData([])
      }
    } catch (err) {
      console.error('fetchSensor:', err.message)
    } finally {
      setChartLoading(false)
    }
  }, [activeDevice?.device_token])

  // ── Fetch suhu luar ───────────────────────────────────────────────────────
  const fetchOutdoor = useCallback(async () => {
    let { lat, lon } = coordsRef.current

    // Belum ada koordinat — minta GPS sekali saja
    if (lat == null) {
      setGpsStatus('loading')
      try {
        const pos = await getGpsLocation()
        lat = pos.lat
        lon = pos.lon
        coordsRef.current = { lat, lon }
        setGpsStatus('ok')

        // Nama kota — best-effort, tidak blocking
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
          .then(r => r.json())
          .then(j => {
            const city = j.address?.city || j.address?.town || j.address?.village || ''
            if (city) setLocationName(city)
          })
          .catch(() => setLocationName('Semarang'))
      } catch (err) {
        console.warn('Geolocation failed, falling back to Semarang default coordinates:', err)
        // Fallback ke Semarang (dekat kampus Polines Tembalang)
        lat = -7.0483
        lon = 110.4410
        coordsRef.current = { lat, lon }
        setGpsStatus('ok')
        setLocationName('Semarang')
      }
    }

    // Ambil cuaca — jika gagal, jangan reset nilai lama
    const outdoor = await fetchOutdoorTemp(lat, lon)
    if (outdoor.suhu != null) {
      outdoorRef.current = outdoor
      setOutdoorTemp(outdoor.suhu)
      setOutdoorHum(outdoor.kelembapan)
    }
  }, [])

  // ── Full refresh ──────────────────────────────────────────────────────────
  const fullRefresh = useCallback(async () => {
    await fetchOutdoor()
    await fetchSensor()
  }, [fetchOutdoor, fetchSensor])

  // ── Mount & Active Device Changes ─────────────────────────────────────────
  useEffect(() => {
    // Jalankan fetch outdoor (cuaca) dan fetch sensor secara paralel/independen (non-blocking)
    fetchOutdoor()
    fetchSensor()

    if (!activeDevice?.device_token) return

    const channel = supabase
      .channel(`realtime_iot_${activeDevice.device_token}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sensor_data',
          filter: `device_token=eq.${activeDevice.device_token}`
        },
        fetchSensor
      )
      .subscribe()

    const sensorTimer  = setInterval(fetchSensor,  30_000)
    const outdoorTimer = setInterval(fetchOutdoor, 5 * 60_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(sensorTimer)
      clearInterval(outdoorTimer)
    }
  }, [activeDevice?.device_token, fetchOutdoor, fetchSensor])

  // ── Saat suhu luar update, perbarui garis di chart tanpa re-fetch ─────────
  useEffect(() => {
    if (outdoorTemp == null) return
    setChartData(prev =>
      prev.map(d => ({ ...d, suhuLuar: outdoorTemp }))
    )
  }, [outdoorTemp])

  const handleModeChange = async (e, newValue) => {
    if (newValue === null || !activeDevice) return
    try {
      await updateCategoryMode(activeDevice.id, newValue)
    } catch (err) {
      console.error('Error changing category mode:', err)
    }
  }

  // ─── Color tokens (PANTURA Design System) ────────────────────────────────
  const isDark       = theme.palette.mode === 'dark'
  const accent       = isDark ? '#A78BFA' : '#7C3AED'
  const accentLight  = isDark ? '#2D2650' : '#EDE9FF'
  const bgSecondary  = isDark ? '#1A1830' : '#F5F4FE'
  const borderColor  = isDark ? 'rgba(167,139,250,0.15)' : 'rgba(124,58,237,0.12)'
  const textSecondary = isDark ? '#9390B0' : '#6B6A85'

  if (!activeDevice) {
    return (
      <Card sx={{
        borderRadius: '16px',
        border: `0.5px solid ${borderColor}`,
        boxShadow: 'none',
        bgcolor: 'background.paper',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        p: 6, textAlign: 'center'
      }}>
        <Box>
          <i className='ri-router-line' style={{ fontSize: '3rem', color: textSecondary }} />
          <Typography variant='h6' sx={{ mt: 2, color: 'text.primary' }}>Pilih perangkat untuk melihat data</Typography>
          <Typography variant='body2' sx={{ color: textSecondary, mt: 0.5 }}>
            Silakan pilih perangkat Anda di navbar atas atau tambahkan baru di menu "Perangkat Saya".
          </Typography>
        </Box>
      </Card>
    )
  }

  // ─── Data card ────────────────────────────────────────────────────────────
  const cards = [
    {
      stats: avgTemp != null ? `${avgTemp}°C` : '...',
      title: 'Rata-rata Suhu',
      icon:  'ri-temp-hot-line',
    },
    {
      stats: avgHum != null ? `${avgHum}%` : '...',
      title: 'Rata-rata Kelembapan',
      icon:  'ri-drop-line',
    },
    {
      stats: totalCount != null ? totalCount.toLocaleString() : '...',
      title: 'Total Data',
      icon:  'ri-database-2-line',
    },
    {
      stats: devStatus,
      title: 'Status',
      icon:  'ri-router-line',
    },
    {
      stats: outdoorTemp != null
        ? `${outdoorTemp}°C`
        : gpsStatus === 'error'   ? 'GPS Error'
        : gpsStatus === 'loading' ? '...'
        : '—',
      title: locationName ? `Suhu Luar (${locationName})` : 'Suhu Luar',
      icon:  'ri-sun-line',
    },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────
  // Main Card dengan border halus dan borderRadius 16px
  return (
    <Card sx={{
      borderRadius: '16px',
      border: `0.5px solid ${borderColor}`,
      boxShadow: 'none',
      bgcolor: 'background.paper'
    }}>
      <CardHeader
        title={`IoT Monitor — ${activeDevice.device_name}`}
        titleTypographyProps={{ sx: { fontSize: '16px', fontWeight: 600, color: 'text.primary' } }}
        action={
          <OptionMenu
            iconClassName='text-textPrimary'
            options={[
              { text: 'Refresh Semua',  menuItemProps: { onClick: fullRefresh  } },
              { text: 'Refresh Sensor', menuItemProps: { onClick: fetchSensor  } },
              { text: 'Refresh Cuaca',  menuItemProps: { onClick: fetchOutdoor } },
            ]}
          />
        }
        subheader={
          <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 500, color: 'inherit' }}>Smart Monitoring System</span>
            <span style={{ color: textSecondary }}>— {activeDevice.device_token}</span>
            {gpsStatus === 'loading' && <CircularProgress size={10} />}
            {gpsStatus === 'ok' && locationName && (
              <Box sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                height: 20,
                fontSize: '0.65rem',
                fontWeight: 500,
                bgcolor: accentLight,
                color: accent,
                border: `1px solid ${borderColor}`,
                borderRadius: '10px',
                pl: '6px',
                pr: '8px',
                lineHeight: 1
              }}>
                <i className='ri-map-pin-line' style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center' }} />
                <span>{locationName}</span>
              </Box>
            )}
            {gpsStatus === 'error' && (
              <Chip label='GPS tidak tersedia' size='small' color='error' sx={{ height: 20, fontSize: '0.65rem' }} />
            )}
          </Box>
        }
      />

      <CardContent sx={{ pt: '4px !important' }}>
        {/* ── 5 STAT CARDS SEJAJAR ─────────────────────────────────────── */}
        <Grid container spacing={2}>
          {cards.map((item, i) => (
            <Grid item xs={12} sm={6} md={2.4} key={i}>
              {/* Card individual dengan hover effect */}
              <Box sx={{
                background: theme.palette.background.paper,
                border: `0.5px solid ${borderColor}`,
                borderRadius: '12px',
                p: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                transition: 'box-shadow 150ms ease',
                '&:hover': { boxShadow: `0 4px 20px rgba(124, 58, 237, 0.08)` }
              }}>
                {/* Icon circle */}
                <Box sx={{
                  width: 36, height: 36, borderRadius: '50%',
                  bgcolor: accentLight,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <i className={item.icon} style={{ fontSize: '1rem', color: accent }} />
                </Box>
                {/* Value + Label */}
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{
                    fontSize: '22px', fontWeight: 600, fontFamily: 'monospace',
                    lineHeight: 1.2, color: 'text.primary',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {item.stats}
                  </Typography>
                  <Typography sx={{ fontSize: '11px', color: textSecondary, mt: 0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          ))}
        </Grid>

        {/* ── MODE RUANGAN AKTIF CONTROL ────────────────────────────────── */}
        <Box sx={{
          mt: 3, p: '20px 24px',
          borderRadius: '12px',
          border: `0.5px solid ${borderColor}`,
          bgcolor: bgSecondary
        }}>
          <Typography sx={{ fontSize: '15px', fontWeight: 500, mb: 2, color: 'text.primary' }}>
            Mode Ruangan Aktif
          </Typography>
          {/* Grid 2x2 untuk ToggleButton */}
          <ToggleButtonGroup
            value={activeDevice.active_category_id || 1}
            exclusive
            onChange={handleModeChange}
            aria-label='active room mode'
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 1.5,
              width: '100%',
              '& .MuiToggleButtonGroup-grouped': {
                margin: '0 !important',
                border: 'none !important',
              }
            }}
          >
            {categoryModes.map((opt) => {
              const isSelected = (activeDevice.active_category_id || 1) === opt.id
              return (
                <ToggleButton
                  key={opt.id}
                  value={opt.id}
                  sx={{
                    borderRadius: '10px !important',
                    border: `1px solid ${borderColor} !important`,
                    fontSize: '14px',
                    textTransform: 'none',
                    py: 1.5,
                    px: 2,
                    justifyContent: 'flex-start',
                    gap: 1,
                    transition: 'all 150ms ease',
                    color: `${textSecondary} !important`,
                    bgcolor: 'background.paper !important',
                    '&.Mui-selected': {
                      bgcolor: `${accentLight} !important`,
                      color: `${accent} !important`,
                      border: `1px solid ${accent} !important`,
                      boxShadow: `0 0 12px ${accent}25`,
                      fontWeight: 600,
                      '&:hover': {
                        bgcolor: `${accentLight} !important`,
                        filter: 'brightness(0.95)'
                      }
                    },
                    '&:hover': {
                      bgcolor: `${accentLight}20 !important`,
                      color: `${accent} !important`,
                      borderColor: `${accent}40 !important`
                    },
                    '&:active': { transform: 'scale(0.98)' }
                  }}
                >
                  <i className={opt.icon} style={{ fontSize: '1.1rem' }} />
                  {opt.label}
                </ToggleButton>
              )
            })}
          </ToggleButtonGroup>
        </Box>

        {/* ── CHART ────────────────────────────────────────────────────── */}
        <Box sx={{ mt: 3 }}>
          <Box sx={{ mb: 1.5 }}>
            <Typography sx={{ fontSize: '15px', fontWeight: 500, color: 'text.primary' }}>
              Tren Suhu Dalam vs Luar Ruangan
            </Typography>
            <Typography sx={{ fontSize: '11px', color: textSecondary, mt: 0.3 }}>
              {chartData.length > 0
                ? `Menampilkan ${chartData.length} titik dari ${DATA_LIMIT} data terakhir`
                : 'Memuat data...'}
              {outdoorTemp != null && ` · Suhu luar: ${outdoorTemp}°C`}
              {outdoorHum  != null && `, RH ${outdoorHum}%`}
            </Typography>
          </Box>

          {chartLoading && chartData.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220 }}>
              <CircularProgress size={28} sx={{ color: accent }} />
            </Box>
          ) : (
            <ResponsiveContainer width='100%' height={260}>
              <AreaChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id='colorSuhuDalam' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='5%' stopColor={accent} stopOpacity={0.15}/>
                    <stop offset='95%' stopColor={accent} stopOpacity={0.0}/>
                  </linearGradient>
                  {outdoorTemp != null && (
                    <linearGradient id='colorSuhuLuar' x1='0' y1='0' x2='0' y2='1'>
                      <stop offset='5%' stopColor='#D97706' stopOpacity={0.08}/>
                      <stop offset='95%' stopColor='#D97706' stopOpacity={0.0}/>
                    </linearGradient>
                  )}
                </defs>
                {/* Grid halus dengan warna border yang kontras */}
                <CartesianGrid strokeDasharray='3 3' stroke={borderColor} opacity={0.3} />
                <XAxis
                  dataKey='waktu'
                  tick={{ fontSize: 10, fill: textSecondary }}
                  interval='preserveStartEnd'
                  axisLine={{ stroke: borderColor }}
                  tickLine={false}
                />
                <YAxis
                  domain={[
                    dataMin => Math.min(24, Math.floor(dataMin - 0.5)),
                    dataMax => Math.max(32, Math.ceil(dataMax + 0.5))
                  ]}
                  tick={{ fontSize: 10, fill: textSecondary }}
                  label={{ value: 'Suhu (°C)', angle: -90, position: 'insideLeft', fontSize: 10, fill: textSecondary, offset: -5 }}
                  axisLine={{ stroke: borderColor }}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {/* Reference line max - warna error */}
                <ReferenceLine y={30} stroke={theme.palette.error.main} strokeDasharray='4 4'
                  label={{ value: 'Max 30°C', fontSize: 9, fill: theme.palette.error.main, position: 'insideTopRight' }} />
                {/* Reference line min - warna info */}
                <ReferenceLine y={26} stroke={theme.palette.info.main} strokeDasharray='4 4'
                  label={{ value: 'Min 26°C', fontSize: 9, fill: theme.palette.info.main, position: 'insideBottomRight' }} />

                {/* Suhu Dalam — accent purple area */}
                <Area
                  type='monotone'
                  dataKey='suhuDalam'
                  name='Suhu Dalam (°C)'
                  stroke={accent}
                  strokeWidth={2}
                  fill='url(#colorSuhuDalam)'
                  activeDot={{ r: 5, fill: accent, strokeWidth: 0 }}
                />

                {/* Suhu Luar — amber area, hanya render jika outdoorTemp ada */}
                {outdoorTemp != null && (
                  <Area
                    type='monotone'
                    dataKey='suhuLuar'
                    name={`Suhu Luar${locationName ? ` (${locationName})` : ''} (°C)`}
                    stroke='#D97706'
                    strokeWidth={2}
                    strokeDasharray='5 3'
                    fill='url(#colorSuhuLuar)'
                    activeDot={{ r: 5, fill: '#D97706', strokeWidth: 0 }}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}

          {/* Keterangan warna legend manual */}
          <Box sx={{ display: 'flex', gap: 3, mt: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Box sx={{ width: 20, height: 2, bgcolor: accent, borderRadius: 1 }} />
              <Typography sx={{ fontSize: '11px', color: textSecondary }}>Suhu dalam ruangan</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Box sx={{ width: 20, height: 2, bgcolor: '#D97706', borderRadius: 1, opacity: outdoorTemp != null ? 1 : 0.35 }} />
              <Typography sx={{ fontSize: '11px', color: textSecondary }}>
                {outdoorTemp != null
                  ? `Suhu luar (${outdoorTemp}°C${outdoorHum != null ? `, RH ${outdoorHum}%` : ''})`
                  : gpsStatus === 'loading' ? 'Mengambil lokasi GPS...'
                  : gpsStatus === 'error'   ? 'Suhu luar tidak tersedia'
                  : 'Menunggu data cuaca...'}
              </Typography>
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

export default IoTTempMonitor