# PowerShell script to add Farmer occupation to MySQL database
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "Add Farmer Occupation"
$form.Size = New-Object System.Drawing.Size(500, 300)
$form.StartPosition = "CenterScreen"
$form.BackColor = [System.Drawing.Color]::White

$label = New-Object System.Windows.Forms.Label
$label.Location = New-Object System.Drawing.Point(20, 20)
$label.Size = New-Object System.Drawing.Size(450, 40)
$label.Text = "This will add 'Farmer' occupation with 10 categories to your database"
$label.Font = New-Object System.Drawing.Font("Arial", 11, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($label)

$mysqlPathLabel = New-Object System.Windows.Forms.Label
$mysqlPathLabel.Location = New-Object System.Drawing.Point(20, 70)
$mysqlPathLabel.Size = New-Object System.Drawing.Size(120, 20)
$mysqlPathLabel.Text = "MySQL Path:"
$form.Controls.Add($mysqlPathLabel)

$mysqlPathBox = New-Object System.Windows.Forms.TextBox
$mysqlPathBox.Location = New-Object System.Drawing.Point(140, 70)
$mysqlPathBox.Size = New-Object System.Drawing.Size(320, 20)
$mysqlPathBox.Text = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
$form.Controls.Add($mysqlPathBox)

$passwordLabel = New-Object System.Windows.Forms.Label
$passwordLabel.Location = New-Object System.Drawing.Point(20, 100)
$passwordLabel.Size = New-Object System.Drawing.Size(120, 20)
$passwordLabel.Text = "MySQL Password:"
$form.Controls.Add($passwordLabel)

$passwordBox = New-Object System.Windows.Forms.TextBox
$passwordBox.Location = New-Object System.Drawing.Point(140, 100)
$passwordBox.Size = New-Object System.Drawing.Size(320, 20)
$passwordBox.Text = "12345"
$passwordBox.UseSystemPasswordChar = $true
$form.Controls.Add($passwordBox)

$addButton = New-Object System.Windows.Forms.Button
$addButton.Location = New-Object System.Drawing.Point(140, 140)
$addButton.Size = New-Object System.Drawing.Size(200, 35)
$addButton.Text = "Add Farmer Occupation"
$addButton.BackColor = [System.Drawing.Color]::FromArgb(76, 175, 80)
$addButton.ForeColor = [System.Drawing.Color]::White
$addButton.Font = New-Object System.Drawing.Font("Arial", 10, [System.Drawing.FontStyle]::Bold)
$addButton.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$form.Controls.Add($addButton)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Location = New-Object System.Drawing.Point(20, 190)
$statusLabel.Size = New-Object System.Drawing.Size(450, 60)
$statusLabel.Text = "Status: Ready"
$statusLabel.Font = New-Object System.Drawing.Font("Arial", 9)
$form.Controls.Add($statusLabel)

$addButton.Add_Click({
    $statusLabel.Text = "Status: Adding Farmer occupation..."
    $statusLabel.ForeColor = [System.Drawing.Color]::Blue
    $form.Refresh()
    
    try {
        $mysqlPath = $mysqlPathBox.Text
        $password = $passwordBox.Text
        
        if (-not (Test-Path $mysqlPath)) {
            $statusLabel.Text = "ERROR: MySQL not found at specified path!`nPlease update the path."
            $statusLabel.ForeColor = [System.Drawing.Color]::Red
            return
        }
        
        $sqlFile = "C:\EXPENSE TEACKER\Expense-Tracker-Fullstack-Using-Spring-Boot\backend\add_farmer_occupation.sql"
        
        $result = & $mysqlPath -u root -p$password expense_tracker -e "SOURCE '$sqlFile'" 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            $statusLabel.Text = "SUCCESS! Farmer occupation added with 10 categories!`nRefresh your browser to see it."
            $statusLabel.ForeColor = [System.Drawing.Color]::Green
        } else {
            $statusLabel.Text = "ERROR: $result`nPlease check MySQL credentials."
            $statusLabel.ForeColor = [System.Drawing.Color]::Red
        }
    } catch {
        $statusLabel.Text = "ERROR: $($_.Exception.Message)"
        $statusLabel.ForeColor = [System.Drawing.Color]::Red
    }
})

$form.ShowDialog()
