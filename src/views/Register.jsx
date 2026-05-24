'use client'

// React Imports
import { useState } from 'react'

// Next Imports
import Link from 'next/link'

// MUI Imports
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Checkbox from '@mui/material/Checkbox'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import Divider from '@mui/material/Divider'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'

// Component Imports
import Illustrations from '@components/Illustrations'
import Logo from '@components/layout/shared/Logo'

// Hook Imports
import { useImageVariant } from '@core/hooks/useImageVariant'

// Supabase Import
import { supabase } from '@/libs/supabaseClient'

const Register = ({ mode }) => {
  // States
  const [namaLengkap, setNamaLengkap] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordShown, setIsPasswordShown] = useState(false)
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [loading, setLoading] = useState(false)

  // Vars
  const darkImg = '/images/pages/auth-v1-mask-dark.png'
  const lightImg = '/images/pages/auth-v1-mask-light.png'

  // Hooks
  const authBackground = useImageVariant(mode, lightImg, darkImg)
  const handleClickShowPassword = () => setIsPasswordShown(show => !show)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (!agreeTerms) {
      setErrorMsg('Anda harus menyetujui syarat dan ketentuan.')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nama_lengkap: namaLengkap,
          },
        },
      })

      if (error) {
        throw error
      }

      setSuccessMsg('Registrasi berhasil! Cek email kamu untuk verifikasi akun.')
      // Clear fields
      setNamaLengkap('')
      setEmail('')
      setPassword('')
      setAgreeTerms(false)
    } catch (err) {
      setErrorMsg(err.message || 'Registrasi gagal. Silakan coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setErrorMsg('')
    setSuccessMsg('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
    } catch (err) {
      setErrorMsg(err.message || 'Gagal terhubung dengan Google.')
      setLoading(false)
    }
  }

  return (
    <div className='flex flex-col justify-center items-center min-bs-[100dvh] relative p-6'>
      <Card className='flex flex-col sm:is-[450px]'>
        <CardContent className='p-6 sm:!p-12'>
          <Link href='/' className='flex justify-center items-start mbe-6'>
            <Logo />
          </Link>
          <div className='flex flex-col gap-5'>
            <div>
              <Typography variant='h4'>Mulai Perjalananmu</Typography>
              <Typography className='mbs-1'>Daftar untuk memantau sensor IoT kamu</Typography>
            </div>

            {errorMsg && <Alert severity='error'>{errorMsg}</Alert>}
            {successMsg && <Alert severity='success'>{successMsg}</Alert>}

            <form noValidate autoComplete='off' onSubmit={handleSubmit} className='flex flex-col gap-5'>
              <TextField
                autoFocus
                fullWidth
                label='Nama Lengkap'
                value={namaLengkap}
                onChange={(e) => setNamaLengkap(e.target.value)}
                disabled={loading}
              />
              <TextField
                fullWidth
                label='Email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
              <TextField
                fullWidth
                label='Password'
                type={isPasswordShown ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position='end'>
                      <IconButton
                        size='small'
                        edge='end'
                        onClick={handleClickShowPassword}
                        onMouseDown={e => e.preventDefault()}
                      >
                        <i className={isPasswordShown ? 'ri-eye-off-line' : 'ri-eye-line'} />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    disabled={loading}
                  />
                }
                label={
                  <>
                    <span>Saya menyetujui </span>
                    <Link className='text-primary' href='/' onClick={e => e.preventDefault()}>
                      syarat dan ketentuan
                    </Link>
                  </>
                }
              />
              <Button
                fullWidth
                variant='contained'
                type='submit'
                disabled={loading}
                startIcon={loading && <CircularProgress size={20} color='inherit' />}
              >
                {loading ? 'Mendaftarkan...' : 'Daftar'}
              </Button>
              <div className='flex justify-center items-center flex-wrap gap-2'>
                <Typography>Sudah punya akun?</Typography>
                <Typography component={Link} href='/login' color='primary'>
                  Masuk di sini
                </Typography>
              </div>
              <Divider className='gap-3'>atau</Divider>
              <div className='flex justify-center items-center gap-2'>
                <Button
                  fullWidth
                  variant='outlined'
                  color='secondary'
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  startIcon={<i className='ri-google-fill' style={{ color: '#db4437' }} />}
                >
                  Daftar dengan Google
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>
      <Illustrations maskImg={{ src: authBackground }} />
    </div>
  )
}

export default Register
