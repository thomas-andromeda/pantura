// Layout Imports
import LayoutWrapper from '@layouts/LayoutWrapper'
import VerticalLayout from '@layouts/VerticalLayout'

// Component Imports
import Providers from '@components/Providers'
import Navigation from '@components/layout/vertical/Navigation'
import Navbar from '@components/layout/vertical/Navbar'
import VerticalFooter from '@components/layout/vertical/Footer'

// Context Imports
import { AuthProvider } from '@/contexts/AuthContext'
import { DeviceProvider } from '@/contexts/DeviceContext'

const Layout = async ({ children }) => {
  // Vars
  const direction = 'ltr'

  return (
    <Providers direction={direction}>
      <AuthProvider>
        <DeviceProvider>
          <LayoutWrapper
            verticalLayout={
              <VerticalLayout navigation={<Navigation />} navbar={<Navbar />} footer={<VerticalFooter />}>
                {children}
              </VerticalLayout>
            }
          />
        </DeviceProvider>
      </AuthProvider>
    </Providers>
  )
}

export default Layout
