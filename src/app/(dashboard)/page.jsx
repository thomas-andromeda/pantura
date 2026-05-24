'use client'

// MUI Imports
import Grid from '@mui/material/Grid'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'

// Next Imports
import Link from 'next/link'

// Context Imports
import { useDevice } from '@/contexts/DeviceContext'

// Components Imports
import IoTTempMonitor from '@views/dashboard/IoTTempMonitor'
import TemperatureOverview from '@/views/dashboard/TemperatureOverview'

const DashboardAnalytics = () => {
  const { devices, activeDevice, loading } = useDevice()

  if (loading) {
    return (
      <Box className='flex justify-center items-center min-bs-[400px]'>
        <CircularProgress />
      </Box>
    )
  }

  if (devices.length === 0) {
    return (
      <Box className='flex justify-center items-center min-bs-[400px] p-6'>
        <Card className='flex flex-col items-center justify-center p-12 text-center shadow-md max-w-lg w-full'>
          <Box className='flex items-center justify-center rounded-full p-4 mbe-4' style={{ backgroundColor: 'rgba(102, 108, 255, 0.08)' }}>
            <i className='ri-router-line text-primary' style={{ fontSize: '3rem' }} />
          </Box>
          <Typography variant='h5' className='mbe-2 font-medium'>
            Belum Ada Perangkat Terdaftar
          </Typography>
          <Typography variant='body2' color='textSecondary' className='mbe-6'>
            Untuk mulai memantau suhu dan kelembapan, daftarkan perangkat ESP32 Anda terlebih dahulu.
          </Typography>
          <Button
            component={Link}
            href='/devices'
            variant='contained'
            color='primary'
            startIcon={<i className='ri-add-line' />}
          >
            Daftar Perangkat Baru
          </Button>
        </Card>
      </Box>
    )
  }

  return (
    <Grid container spacing={6}>
      {!activeDevice && (
        <Grid item xs={12}>
          <Alert severity='warning'>
            Silakan pilih perangkat aktif dari menu dropdown di navbar atas.
          </Alert>
        </Grid>
      )}

      <Grid item xs={12}>
        <IoTTempMonitor />
      </Grid>
      <Grid item xs={12}>
        <TemperatureOverview />
      </Grid>
    </Grid>
  )
}

export default DashboardAnalytics
