---
title: Getting Started With Mikrotik and Terraform
description: Adopting your Mikrotik router to Terraform for automation and management.
tags:
  - terraform
  - mikrotik
image:
  path: /assets/img/posts/2025-02-12-mikrotik-terraform-getting-started/featured.webp
  lqip: /assets/img/posts/2025-02-12-mikrotik-terraform-getting-started/featured_lqip.webp
date: 2025-02-12
---

After much ado and months of procrastination, we're finally here! In this blog post we're gonna be getting started with our Terraform-Mikrotik network automation. The goals for this one are not overly ambitious, but that's not to say they're not important. What I'm setting out to achieve is:

1. Connecting Terraform to Mikrotik,
2. Importing the default Mikrotik configuration that comes with my RB5009 into Terraform,
3. Making the *least* amount of changes necessary to get internet access.

Again, this might not seem like much, but it will be a very solid base for our network automation. At the end of this post, my entire Mikrotik router will be terraform-managed!

## Setting up our Dev Environment

The prerequisites for this one are super light. All we really need is to have the terraform CLI installed. If you haven't installed it yet, you can follow the official [installation guide](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli) or use whatever package manager you fancy.

For this tutorial, I will once more be using [`mise`](https://mise.jdx.dev/) to manage my dev tools:

```bash
Workspace/terraform/mikrotik-demo
❯ mise use aqua:hashicorp/terraform
mise ~/Workspace/terraform/mikrotik-demo/mise.toml tools: aqua:hashicorp/terraform@1.10.5
```

The important thing for this section is to be able to run terraform commands. You should be able to run `terraform version` and see some output similar to this:

```bash
Workspace/terraform/mikrotik-demo via 💠 default 
❯ terraform version
Terraform v1.10.5
```

## Connecting Terraform to Mikrotik

Now that terraform is all set up, we need to install the RouterOS provider and connect it to our Mikrotik device.

### Installing the Provider

The provider we're going to use is [terraform-routeros](https://registry.terraform.io/providers/terraform-routeros/routeros/latest). We're going to install the latest version which, at the time of writing, is `1.76.3`. To do that, I typically create a `providers.tf` file in the root of my project and configure the `required_providers` block there:

```terraform
terraform {
  required_providers {
    routeros = {
      source  = "terraform-routeros/routeros"
      version = "1.76.0"
    }
  }
}
```
{: file='provider.tf'}

With that in place, we need to tell terraform to download and set up that provider. Basically, we need to initialize our workspace. To do that, we need to run the `terraform init` command:

```bash
Workspace/terraform/mikrotik-demo via 💠 default 
❯ terraform init
Initializing the backend...
Initializing provider plugins...
- Finding terraform-routeros/routeros versions matching "1.76.0"...
- Installing terraform-routeros/routeros v1.76.0...
- Installed terraform-routeros/routeros v1.76.0 (self-signed, key ID 45571F2D7311B119)
Partner and community providers are signed by their developers.
If you'd like to know more about provider signing, you can read about it here:
https://www.terraform.io/docs/cli/plugins/signing.html
Terraform has created a lock file .terraform.lock.hcl to record the provider
selections it made above. Include this file in your version control repository
so that Terraform can guarantee to make the same selections by default when
you run "terraform init" in the future.

Terraform has been successfully initialized!

You may now begin working with Terraform. Try running "terraform plan" to see
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.
```

### Configuring the Provider

With the provider installed, we need to configure it to basically tell it at which IP address it can find our router and the credentials it needs to use to authenticate. This is done by adding a `provider` block with the required parameters which you can find in the [official documentation](https://registry.terraform.io/providers/terraform-routeros/routeros/latest/docs#example-usage) of the provider.

> By default, Mikrotik routers use an IP of `192.168.88.1` and a username of `admin`.  
> Depending on your model, the password *might* be blank or it *might* be randomized. If it's blank, well... you'll know. If it's randomized, it will be written on your device, on the label next to the serial number and whatnot.
{: .prompt-info }

I typically dump that config in my `providers.tf` file as well:

```terraform
# ...
provider "routeros" {
  hosturl  = var.mikrotik_host_url
  username = var.mikrotik_username
  password = var.mikrotik_password
  insecure = var.mikrotik_insecure
}
```
{: file='provider.tf'}

You can see here that I defined variables for all these connection parameters instead of hardcoding them in. You *can* do that if you want to (put your credentials in there), but I don't really recommend to, especially if you intend to push this code to git eventually.

To be able to use these variables, we need to first define them:

```terraform
variable "mikrotik_host_url" {
  type        = string
  sensitive   = false
  description = "The URL of the MikroTik device."
}

variable "mikrotik_username" {
  type        = string
  sensitive   = true
  description = "The username for accessing the MikroTik device."
}

variable "mikrotik_password" {
  type        = string
  sensitive   = true
  description = "The password for accessing the MikroTik device."
}

variable "mikrotik_insecure" {
  type        = bool
  default     = true
  description = "Whether to allow insecure connections to the MikroTik device."
}
```
{: file='variables.tf'}

And now we need to tell terraform what the values for these variables actually are. I typically create a `credentials.auto.tfvars` file and make sure to `gitignore` it.

Another note here is that while you can continue using the `admin` user, it is best practice to log in and create a dedicated user for terraform. I personally created mine with full administrative rights:

```terraform
mikrotik_host_url = "https://192.168.88.1"
mikrotik_username = "terraform"
mikrotik_password = "terr4f0rm"
mikrotik_insecure = true
```
{: file='credentials.auto.tfvars'}

### Validating the Connection

At this point we should be all set up and ready to go. We can run `terraform apply` to validate the connection to our Mikrotik router:

```bash
Workspace/terraform/mikrotik-demo via 💠 default 
❯ terraform apply

No changes. Your infrastructure matches the configuration.

Terraform has compared your real infrastructure against your configuration and found no
differences, so no changes are needed.

Apply complete! Resources: 0 added, 0 changed, 0 destroyed.
```

If you see output similar to the above, then it means terraform has successfully connected to your Mikrotik device, and you're ready to move on to the next steps!

## Importing the Default Configuration

## Modifying the Default Configuration

## Next Steps
